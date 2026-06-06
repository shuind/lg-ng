import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NOVEL_DIRECTORIES, templateFiles } from "./templates.js";

export interface NovelInitResult {
  created: string[];
  skipped: string[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function initNovelWorkspace(cwd: string, projectName: string): Promise<NovelInitResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const dir of NOVEL_DIRECTORIES) {
    const abs = path.join(cwd, dir);
    if (await exists(abs)) {
      skipped.push(dir);
      continue;
    }
    await mkdir(abs, { recursive: true });
    created.push(dir);
  }

  for (const [file, content] of Object.entries(templateFiles(projectName))) {
    const abs = path.join(cwd, file);
    if (await exists(abs)) {
      skipped.push(file);
      continue;
    }
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    created.push(file);
  }

  return { created, skipped };
}
