"use client"

import { useRef, useState } from "react"
import { AtSign, FileText, FolderOpen, Loader2, UploadCloud } from "lucide-react"
import type { ImportMaterialsResponse } from "@/lib/api/imports"
import type { ImportedMaterial } from "@/lib/types"
import { cn } from "@/lib/utils"

const ACCEPTED_TEXT_FILES = ".md,.txt,.json,.csv,.yaml,.yml,.log"

export function ImportMaterialsView({
  bookId,
  materials,
  onImportMaterials,
  onCiteMaterial,
  onOpenFile,
}: {
  bookId: string
  materials: ImportedMaterial[]
  onImportMaterials: (files: File[]) => Promise<ImportMaterialsResponse>
  onCiteMaterial: (material: ImportedMaterial) => void
  onOpenFile: (path: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [importing, setImporting] = useState(false)
  const [lastResult, setLastResult] = useState<ImportMaterialsResponse | null>(null)
  const recentMaterials = materials.slice(0, 24)

  async function importFiles(files: File[]) {
    if (!bookId || files.length === 0 || importing) return
    setImporting(true)
    setLastResult(null)
    try {
      const result = await onImportMaterials(files)
      setLastResult(result)
    } catch (error) {
      setLastResult({
        imported: [],
        rejected: [{
          name: files.length === 1 ? files[0].name : `${files.length} 个文件`,
          reason: error instanceof Error ? error.message : "导入失败",
        }],
      })
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={!bookId || importing}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragActive(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragActive(false)
          void importFiles(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          "flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center transition",
          dragActive ? "border-primary/50 bg-primary/5" : "border-border/70 bg-card/35 hover:bg-sidebar-accent/20",
          (!bookId || importing) && "cursor-not-allowed opacity-70",
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/50 text-muted-foreground ring-1 ring-border/40">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        </span>
        <span className="text-[12px] font-medium text-foreground">
          {importing ? "导入中..." : "拖入文本材料"}
        </span>
        <span className="max-w-56 text-[11px] leading-relaxed text-muted-foreground">
          md / txt / json / csv / yaml / log，单文件 2MB 内
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TEXT_FILES}
        className="hidden"
        onChange={(event) => void importFiles(Array.from(event.target.files ?? []))}
      />

      {lastResult && (
        <div className="rounded-lg border border-border/50 bg-card/35 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {lastResult.imported.length > 0 && (
            <div className="text-foreground/85">已导入 {lastResult.imported.length} 个文件</div>
          )}
          {lastResult.rejected.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {lastResult.rejected.slice(0, 4).map((item) => (
                <div key={`${item.name}:${item.reason}`} className="truncate" title={`${item.name}: ${item.reason}`}>
                  {item.name}: {item.reason}
                </div>
              ))}
              {lastResult.rejected.length > 4 && (
                <div>还有 {lastResult.rejected.length - 4} 个文件未导入</div>
              )}
            </div>
          )}
        </div>
      )}

      <section className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>最近材料</span>
          <span className="font-mono tracking-normal">{materials.length}</span>
        </div>
        {recentMaterials.length > 0 ? (
          <div className="space-y-1">
            {recentMaterials.map((material) => (
              <MaterialRow
                key={material.path}
                material={material}
                onCite={() => onCiteMaterial(material)}
                onOpen={() => onOpenFile(material.path)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-[12px] text-muted-foreground">
            收件箱里还没有导入材料。
          </div>
        )}
      </section>
    </div>
  )
}

function MaterialRow({
  material,
  onCite,
  onOpen,
}: {
  material: ImportedMaterial
  onCite: () => void
  onOpen: () => void
}) {
  return (
    <div className="group rounded-lg px-2 py-2 transition hover:bg-sidebar-accent/15">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/65" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[12.5px] font-medium text-foreground">{material.name}</div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground/75">
            {material.summary}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/40">
            {material.path}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={onCite}
            className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-sidebar-accent hover:text-foreground"
            title="引用到对话"
            aria-label={`引用材料 ${material.name}`}
          >
            <AtSign className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="rounded-md p-1 text-muted-foreground/60 transition hover:bg-sidebar-accent hover:text-foreground"
            title="打开材料"
            aria-label={`打开材料 ${material.name}`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
