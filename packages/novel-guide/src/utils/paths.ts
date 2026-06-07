import path from "node:path";

export function normalizeSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function resolveInside(cwd: string, inputPath: string): string {
  const resolved = path.resolve(cwd, inputPath);
  if (!isInside(cwd, resolved)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return resolved;
}

export function relativeTo(cwd: string, target: string): string {
  return normalizeSlashPath(path.relative(cwd, target) || ".");
}

export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
