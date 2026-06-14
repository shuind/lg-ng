/**
 * Extract a JSON object from a model response that may be wrapped in Markdown
 * code fences or surrounded by prose. Throws if no `{ ... }` object is found.
 */
export function parseJsonFromModel(content: string): unknown {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const raw = fenced ? fenced[1].trim() : trimmed
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("没有找到 JSON 对象。")
  return JSON.parse(raw.slice(start, end + 1))
}
