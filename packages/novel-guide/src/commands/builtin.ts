import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "./types.js";
import { renderEjectHandoff } from "../handoff/render.js";
import { initNovelWorkspace } from "../novel/init.js";
import { copyTextToClipboard } from "../utils/clipboard.js";
import { resolveInside, relativeTo } from "../utils/paths.js";

interface BundleCopyResult {
  copied: string[];
  missing: string[];
}

async function copyReferencedFilesToBundle(
  cwd: string,
  filesRelativeDir: string,
  filesToBundle: string[],
): Promise<BundleCopyResult> {
  const copied: string[] = [];
  const missing: string[] = [];

  for (const fileToBundle of filesToBundle) {
    let sourcePath: string;
    let targetPath: string;
    try {
      sourcePath = resolveInside(cwd, fileToBundle);
      targetPath = resolveInside(cwd, path.posix.join(filesRelativeDir, fileToBundle));
    } catch {
      missing.push(fileToBundle);
      continue;
    }

    const sourceStat = await stat(sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) {
      missing.push(fileToBundle);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    copied.push(relativeTo(cwd, targetPath));
  }

  return { copied, missing };
}

export function getBuiltinCommands(): Command[] {
  return [
    {
      type: "local",
      name: "novel-init",
      description: "Initialize a Novel Guide workspace in the current directory.",
      argumentHint: "[作品名]",
      userInvocable: true,
      source: "builtin",
      async execute(args, context) {
        const projectName = args.trim() || path.basename(context.cwd);
        const result = await initNovelWorkspace(context.cwd, projectName);
        return {
          ok: true,
          content: [
            `Novel workspace initialized for: ${projectName}`,
            `Created: ${result.created.length}`,
            `Skipped: ${result.skipped.length}`,
            result.skipped.length ? `Existing items were not overwritten:\n${result.skipped.map((item) => `- ${item}`).join("\n")}` : "",
            "Tip: run git init when you are ready to track this workspace.",
          ].filter(Boolean).join("\n"),
        };
      },
    },
    {
      type: "local",
      name: "eject",
      description: "Export the current REPL session into an upload-ready handoff package.",
      argumentHint: "[chapter-target] [--chapter chNN] [--target name] [--no-zip] [--inline] [--copy]",
      userInvocable: true,
      source: "builtin",
      async execute(args, context) {
        if (!context.engine) {
          return {
            ok: false,
            content: "/eject 只能在交互式 REPL 中导出当前会话。",
          };
        }

        const rendered = renderEjectHandoff({
          cwd: context.cwd,
          sessionId: context.engine.getSessionId(),
          messages: context.engine.getMessagesSnapshot(),
          args,
        });
        let content = rendered.content;
        let polishNote = "未调用模型；这是当前 REPL 会话快照的确定性抽取。";
        if (rendered.mode === "polish") {
          if (!context.engine.polishHandoffDraft) {
            return { ok: false, content: "当前运行环境不支持 /eject --polish。" };
          }
          content = await context.engine.polishHandoffDraft(content, {
            profile: rendered.profile,
            chapter: rendered.chapter,
            target: rendered.target,
          });
          polishNote = "已按 --polish 显式调用一次模型轻收敛；未开放工具，要求不新增事实。";
        }

        const promptPath = resolveInside(context.cwd, rendered.promptRelativePath);
        const promptRelativePath = relativeTo(context.cwd, promptPath);
        const writeTarget = rendered.bundle
          ? `${rendered.packageRelativeDir}${rendered.zipRelativePath ? ` 和 ${rendered.zipRelativePath}` : ""}`
          : promptRelativePath;

        if (context.permissionMode === "confirm") {
          if (!context.askConfirmation) {
            return { ok: false, content: `需要确认后才能写入 ${writeTarget}。` };
          }
          const approved = await context.askConfirmation(`写入 ${writeTarget}？`);
          if (!approved) return { ok: false, content: `用户拒绝写入 ${writeTarget}。` };
        }

        await mkdir(path.dirname(promptPath), { recursive: true });
        await writeFile(promptPath, content, "utf8");

        const fileChanges: Array<{ path: string; operation: "write"; charCount?: number }> = [
          { path: promptRelativePath, operation: "write", charCount: content.length },
        ];
        let bundleResult: BundleCopyResult | null = null;
        let missingRelativePath: string | null = null;
        let zipBytes = 0;

        if (rendered.bundle) {
          const readmePath = resolveInside(context.cwd, rendered.readmeRelativePath);
          const manifestPath = resolveInside(context.cwd, rendered.manifestRelativePath);
          await mkdir(path.dirname(readmePath), { recursive: true });
          await writeFile(readmePath, rendered.readmeContent, "utf8");
          await writeFile(manifestPath, rendered.manifestContent, "utf8");
          fileChanges.push(
            { path: relativeTo(context.cwd, readmePath), operation: "write", charCount: rendered.readmeContent.length },
            { path: relativeTo(context.cwd, manifestPath), operation: "write", charCount: rendered.manifestContent.length },
          );

          bundleResult = await copyReferencedFilesToBundle(context.cwd, rendered.filesRelativeDir, rendered.filesToBundle);
          fileChanges.push(...bundleResult.copied.map((filePath) => ({
            path: filePath,
            operation: "write" as const,
          })));

          if (bundleResult.missing.length > 0) {
            const missingPath = resolveInside(context.cwd, rendered.missingRelativePath);
            const missingContent = `${bundleResult.missing.map((file) => `- ${file}`).join("\n")}\n`;
            await writeFile(missingPath, missingContent, "utf8");
            missingRelativePath = relativeTo(context.cwd, missingPath);
            fileChanges.push({ path: missingRelativePath, operation: "write", charCount: missingContent.length });
          }

          if (rendered.zipRelativePath) {
            const zipRelativePath = rendered.zipRelativePath;
            const zipPath = resolveInside(context.cwd, zipRelativePath);
            const packageFiles = [
              rendered.promptRelativePath,
              rendered.readmeRelativePath,
              rendered.manifestRelativePath,
              ...bundleResult.copied,
              ...(missingRelativePath ? [missingRelativePath] : []),
            ];
            zipBytes = await writeZipArchive(context.cwd, rendered.packageRelativeDir, zipRelativePath, packageFiles);
            fileChanges.push({ path: relativeTo(context.cwd, zipPath), operation: "write", charCount: zipBytes });
          }
        }

        const copyResult = rendered.copy ? await copyTextToClipboard(content) : null;
        const copyNote = copyResult
          ? copyResult.ok
            ? `已复制 prompt.md 内容到剪贴板：${copyResult.method}`
            : `剪贴板复制失败，请手动复制 prompt.md：${copyResult.error}`
          : "未复制到剪贴板；需要时使用 --copy。";

        const packageNote = rendered.bundle
          ? [
              rendered.zipRelativePath
                ? `上传这个 zip：${rendered.zipRelativePath}`
                : "未创建 zip；需要压缩包时去掉 --no-zip。",
              `如果模型不支持 zip，上传这个目录：${rendered.packageRelativeDir}`,
              `提示词文件：${rendered.promptRelativePath}`,
              `已复制工作区文件：${bundleResult?.copied.length ?? 0}/${rendered.filesToBundle.length}`,
              missingRelativePath ? `缺失文件清单：${missingRelativePath}` : "",
            ].filter(Boolean).join("\n")
          : [
              `已导出单文件 handoff：${promptRelativePath}`,
              "这是 --inline/--no-bundle 模式，没有复制工作区文件。",
            ].join("\n");

        return {
          ok: true,
          content: [
            packageNote,
            `来源消息数：${rendered.messageCount}`,
            `预计长度：约 ${rendered.estimatedTokens} tokens`,
            `目标 profile：${rendered.profile}`,
            polishNote,
            copyNote,
            "保存新章到本地后，可运行：/chapter-delta <draft-path>",
          ].join("\n"),
          metadata: {
            fileChanges,
          },
        };
      },
    },
    {
      type: "local",
      name: "chapter-delta",
      description: "Run the readonly chapter-delta agent on a draft path and return structured state changes.",
      argumentHint: "<draft-path>",
      userInvocable: true,
      source: "builtin",
      async execute(args, context) {
        if (!context.engine?.runReadonlySubAgent) {
          return { ok: false, content: "/chapter-delta 只能在支持只读子智能体的交互式 REPL 中运行。" };
        }
        const draftPath = args.trim().split(/\s+/)[0];
        if (!draftPath) return { ok: false, content: "用法：/chapter-delta <draft-path>" };
        const absolutePath = resolveInside(context.cwd, draftPath);
        const relativePath = relativeTo(context.cwd, absolutePath);
        const result = await context.engine.runReadonlySubAgent({
          agent: "chapter-delta",
          prompt: [
            `章节正文路径：${relativePath}`,
            "主流程没有读取正文全文。请你作为只读子智能体读取该文件，抽取状态变化 delta。",
            "只返回结构化 delta、证据短摘和建议更新；不要改文件，不要返回完整正文。",
          ].join("\n"),
        });
        return { ok: true, content: result };
      },
    },
  ];
}

async function writeZipArchive(
  cwd: string,
  packageRelativeDir: string,
  zipRelativePath: string,
  packageFiles: string[],
): Promise<number> {
  const packageRoot = resolveInside(cwd, packageRelativeDir);
  const zipPath = resolveInside(cwd, zipRelativePath);
  const entries: ZipEntryInput[] = [];

  for (const filePath of packageFiles) {
    const absolutePath = resolveInside(cwd, filePath);
    const fileStat = await stat(absolutePath).catch(() => null);
    if (!fileStat?.isFile()) continue;
    const name = relativeTo(packageRoot, absolutePath);
    if (name.startsWith("..") || path.isAbsolute(name)) continue;
    entries.push({
      name,
      data: await readFile(absolutePath),
      modifiedAt: fileStat.mtime,
    });
  }

  await mkdir(path.dirname(zipPath), { recursive: true });
  const archive = createStoreZip(entries);
  await writeFile(zipPath, archive);
  return archive.length;
}

interface ZipEntryInput {
  name: string;
  data: Buffer;
  modifiedAt: Date;
}

function createStoreZip(entries: ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const crc = crc32(entry.data);
    const { dosTime, dosDate } = toDosDateTime(entry.modifiedAt);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + entry.data.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDirectory, end]);
}

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
