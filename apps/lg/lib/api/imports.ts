import type { ImportedMaterial } from "../types"
import { readJsonResponse } from "./common"

export type ImportRejectedMaterial = {
  name: string
  reason: string
}

export type ImportMaterialsResponse = {
  imported: ImportedMaterial[]
  rejected: ImportRejectedMaterial[]
}

export async function listImportedMaterials(bookId: string): Promise<ImportedMaterial[]> {
  const res = await fetch(`/api/books/${bookId}/imports`, { cache: "no-store" })
  const data = await readJsonResponse<ImportedMaterial[]>(res)
  if (!Array.isArray(data)) throw new Error("导入材料返回格式无效")
  return data
}

export async function importMaterials(bookId: string, files: File[]): Promise<ImportMaterialsResponse> {
  const form = new FormData()
  for (const file of files) {
    form.append("files", file)
  }

  const res = await fetch(`/api/books/${bookId}/imports`, {
    method: "POST",
    body: form,
  })
  const data = await res.json().catch(() => ({})) as Partial<ImportMaterialsResponse> & { error?: string }
  const payload = {
    imported: Array.isArray(data.imported) ? data.imported : [],
    rejected: Array.isArray(data.rejected) ? data.rejected : [],
  }
  if (!res.ok && payload.imported.length === 0 && payload.rejected.length === 0) {
    throw new Error(typeof data.error === "string" ? data.error : "导入失败")
  }
  return payload
}
