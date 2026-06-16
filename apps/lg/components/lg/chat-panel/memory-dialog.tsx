"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Brain, Check, Loader2, PauseCircle, Pencil, PlayCircle, Plus, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import {
  createUserMemory,
  deleteUserMemory,
  deleteUserMemoryCandidate,
  extractUserMemory,
  getUserMemory,
  updateUserMemory,
  updateUserMemoryCandidate,
  type UserMemoryPayload,
} from "@/lib/api/user-memory"
import type { UserMemoryCandidate, UserMemoryItem, UserMemoryScope, UserMemoryUsageSnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

type Tab = "saved" | "candidates" | "new"

export function MemoryDialog({
  bookId,
  threadId,
  usedMemory,
  open,
  onOpenChange,
}: {
  bookId: string
  threadId: string
  usedMemory: UserMemoryUsageSnapshot[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [payload, setPayload] = useState<UserMemoryPayload | null>(null)
  const [tab, setTab] = useState<Tab>("saved")
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [manualText, setManualText] = useState("")
  const [manualTags, setManualTags] = useState("")
  const [manualScope, setManualScope] = useState<UserMemoryScope>("global")
  const items = payload?.store.items ?? []
  const candidates = payload?.candidates ?? []

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, bookId])

  async function load() {
    if (!bookId) return
    setLoading(true)
    try {
      setPayload(await getUserMemory(bookId))
    } catch (err) {
      toast({ variant: "destructive", title: "读取 memory 失败", description: getErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  async function refreshFrom(action: Promise<UserMemoryPayload>) {
    try {
      setPayload(await action)
    } catch (err) {
      toast({ variant: "destructive", title: "更新 memory 失败", description: getErrorMessage(err) })
    }
  }

  async function handleToggleStore() {
    if (!payload) return
    await refreshFrom(updateUserMemory({ enabled: !payload.store.enabled, bookId }))
  }

  async function handleCreateManual() {
    const text = manualText.trim()
    if (!text) return
    await refreshFrom(createUserMemory({
      text,
      scope: manualScope,
      bookId: manualScope === "book" ? bookId : undefined,
      tags: parseTags(manualTags),
    }))
    setManualText("")
    setManualTags("")
    setManualScope("global")
    setTab("saved")
  }

  async function handleExtract() {
    if (!bookId || !threadId || extracting) return
    setExtracting(true)
    try {
      setPayload(await extractUserMemory(bookId, threadId))
      setTab("candidates")
    } catch (err) {
      toast({ variant: "destructive", title: "提炼 memory 失败", description: getErrorMessage(err) })
    } finally {
      setExtracting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <Brain className="h-4 w-4" />
            Memory
          </DialogTitle>
          <DialogDescription>
            用户确认保存的长期协作偏好；不保存项目事实、剧情或临时进度。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex min-w-0 items-center gap-1">
            <TabButton active={tab === "saved"} onClick={() => setTab("saved")}>已保存</TabButton>
            <TabButton active={tab === "candidates"} onClick={() => setTab("candidates")}>
              候选{candidates.length > 0 ? ` ${candidates.length}` : ""}
            </TabButton>
            <TabButton active={tab === "new"} onClick={() => setTab("new")}>手动新增</TabButton>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExtract} disabled={!threadId || extracting}>
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              从最近对话提炼
            </Button>
            <Button variant={payload?.store.enabled === false ? "secondary" : "outline"} size="sm" onClick={handleToggleStore} disabled={!payload}>
              {payload?.store.enabled === false ? "已禁用" : "已启用"}
            </Button>
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              读取中
            </div>
          ) : tab === "saved" ? (
            <SavedMemoryView
              items={items}
              bookId={bookId}
              usedMemory={usedMemory}
              onUpdate={(input) => refreshFrom(updateUserMemory(input))}
              onDelete={(id) => refreshFrom(deleteUserMemory(id, bookId))}
            />
          ) : tab === "candidates" ? (
            <CandidateMemoryView
              candidates={candidates}
              bookId={bookId}
              onAccept={(input) => refreshFrom(updateUserMemoryCandidate({ ...input, action: "accept" }))}
              onUpdate={(input) => refreshFrom(updateUserMemoryCandidate(input))}
              onDelete={(id) => refreshFrom(deleteUserMemoryCandidate(id, bookId))}
            />
          ) : (
            <div className="space-y-3">
              <Textarea
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder="例如：讨论架构时先指出关键问题，再展开方案。"
                className="min-h-24"
              />
              <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <ScopeSelect value={manualScope} onChange={setManualScope} />
                <Input value={manualTags} onChange={(event) => setManualTags(event.target.value)} placeholder="tags，用逗号分隔" />
              </div>
              <Button onClick={handleCreateManual} disabled={!manualText.trim()}>
                <Plus className="h-4 w-4" />
                保存
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SavedMemoryView({
  items,
  bookId,
  usedMemory,
  onUpdate,
  onDelete,
}: {
  items: UserMemoryItem[]
  bookId: string
  usedMemory: UserMemoryUsageSnapshot[]
  onUpdate: (input: Parameters<typeof updateUserMemory>[0]) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/25 p-3">
        <div className="mb-2 text-[12px] font-medium text-foreground/80">本轮使用的 memory</div>
        {usedMemory.length > 0 ? (
          <div className="space-y-1.5">
            {usedMemory.map((item) => (
              <div key={item.id} className="rounded bg-background/75 px-2 py-1.5 text-[12px] leading-relaxed">
                {item.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">最近一轮没有注入 memory。</div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          还没有保存的 memory。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <MemoryItemRow
              key={item.id}
              item={item}
              bookId={bookId}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MemoryItemRow({
  item,
  bookId,
  onUpdate,
  onDelete,
}: {
  item: UserMemoryItem
  bookId: string
  onUpdate: (input: Parameters<typeof updateUserMemory>[0]) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const [tags, setTags] = useState(item.tags.join(", "))
  const [scope, setScope] = useState<UserMemoryScope>(item.scope)

  useEffect(() => {
    setText(item.text)
    setTags(item.tags.join(", "))
    setScope(item.scope)
  }, [item])

  if (editing) {
    return (
      <div className="rounded-md border bg-background p-3">
        <Textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-20" />
        <div className="mt-2 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
          <ScopeSelect value={scope} onChange={setScope} />
          <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tags，用逗号分隔" />
        </div>
        <div className="mt-2 flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" />
            取消
          </Button>
          <Button size="sm" onClick={() => {
            onUpdate({
              id: item.id,
              text,
              scope,
              bookId: scope === "book" ? bookId : undefined,
              tags: parseTags(tags),
            })
            setEditing(false)
          }}>
            <Check className="h-3.5 w-3.5" />
            保存
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("rounded-md border p-3", !item.enabled && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-relaxed text-foreground">{item.text}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">{item.scope === "book" ? "当前书籍" : "全局"}</span>
            {item.tags.map((tag) => (
              <span key={tag} className="rounded bg-muted px-1.5 py-0.5">#{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={item.enabled ? "暂停" : "启用"} onClick={() => onUpdate({ id: item.id, enabled: !item.enabled, bookId })}>
            {item.enabled ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton label="编辑" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="删除" onClick={() => onDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      </div>
    </div>
  )
}

function CandidateMemoryView({
  candidates,
  bookId,
  onAccept,
  onUpdate,
  onDelete,
}: {
  candidates: UserMemoryCandidate[]
  bookId: string
  onAccept: (input: Parameters<typeof updateUserMemoryCandidate>[0]) => void
  onUpdate: (input: Parameters<typeof updateUserMemoryCandidate>[0]) => void
  onDelete: (id: string) => void
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        暂无候选。可以点击“从最近对话提炼”。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => (
        <CandidateRow
          key={candidate.id}
          candidate={candidate}
          bookId={bookId}
          onAccept={onAccept}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function CandidateRow({
  candidate,
  bookId,
  onAccept,
  onUpdate,
  onDelete,
}: {
  candidate: UserMemoryCandidate
  bookId: string
  onAccept: (input: Parameters<typeof updateUserMemoryCandidate>[0]) => void
  onUpdate: (input: Parameters<typeof updateUserMemoryCandidate>[0]) => void
  onDelete: (id: string) => void
}) {
  const [text, setText] = useState(candidate.text)
  const [tags, setTags] = useState(candidate.tags.join(", "))
  const [scope, setScope] = useState<UserMemoryScope>(candidate.scope)

  return (
    <div className="rounded-md border bg-background p-3">
      <Textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-20" />
      <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{candidate.reason || "模型提炼的候选偏好。"}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
        <ScopeSelect value={scope} onChange={setScope} />
        <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tags，用逗号分隔" />
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => onDelete(candidate.id)}>
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </Button>
        <Button variant="outline" size="sm" onClick={() => onUpdate({
          id: candidate.id,
          text,
          scope,
          bookId: scope === "book" ? bookId : undefined,
          tags: parseTags(tags),
        })}>
          保存候选
        </Button>
        <Button size="sm" onClick={() => onAccept({
          id: candidate.id,
          text,
          scope,
          bookId: scope === "book" ? bookId : undefined,
          tags: parseTags(tags),
        })}>
          <Check className="h-3.5 w-3.5" />
          接受
        </Button>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-[12px] transition",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function ScopeSelect({ value, onChange }: { value: UserMemoryScope; onChange: (value: UserMemoryScope) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value === "book" ? "book" : "global")}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="global">全局</option>
      <option value="book">当前书籍</option>
    </select>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  )
}

function parseTags(value: string): string[] {
  return value
    .split(/[,\uFF0C;；\s]+/)
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean)
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "请稍后重试。"
}
