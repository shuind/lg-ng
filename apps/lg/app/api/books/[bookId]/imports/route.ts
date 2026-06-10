import { NextResponse } from "next/server"
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_FILES,
  importTextMaterial,
  listImportedMaterials,
  validateImportFileName,
  type ImportRejectedMaterial,
} from "@/lib/server/import-store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    return NextResponse.json(await listImportedMaterials(bookId))
  } catch (err) {
    console.error("[api/books/imports] list error:", err)
    return NextResponse.json({ error: "读取导入材料失败" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const form = await request.formData()
    const files = form.getAll("files").filter((item): item is File => item instanceof File)
    const rejected: ImportRejectedMaterial[] = []

    if (files.length === 0) {
      return NextResponse.json({ imported: [], rejected: [{ name: "files", reason: "没有可导入的文件" }] }, { status: 400 })
    }

    const selectedFiles = files.slice(0, IMPORT_MAX_FILES)
    for (const file of files.slice(IMPORT_MAX_FILES)) {
      rejected.push({ name: file.name || "未命名文件", reason: `一次最多导入 ${IMPORT_MAX_FILES} 个文件` })
    }

    const imported = []
    for (const file of selectedFiles) {
      const name = file.name || "未命名文件"
      const nameError = validateImportFileName(name)
      if (nameError) {
        rejected.push({ name, reason: nameError })
        continue
      }
      if (file.size > IMPORT_MAX_BYTES) {
        rejected.push({ name, reason: "单文件不能超过 2MB" })
        continue
      }

      const content = await file.text()
      try {
        imported.push(await importTextMaterial(bookId, { name, size: file.size, content }))
      } catch (error) {
        rejected.push({ name, reason: error instanceof Error ? error.message : "导入失败" })
      }
    }

    const status = imported.length > 0 ? 200 : 400
    return NextResponse.json({ imported, rejected }, { status })
  } catch (err) {
    console.error("[api/books/imports] import error:", err)
    return NextResponse.json({ error: "导入失败" }, { status: 500 })
  }
}
