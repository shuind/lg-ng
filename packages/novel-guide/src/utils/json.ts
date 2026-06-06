export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value);
}
