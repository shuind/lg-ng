"use client"

import type { ReactNode } from "react"
import { BookOpen, Check, Moon, Plus, Search, Sun, TerminalSquare } from "lucide-react"
import { useTheme } from "next-themes"
import { useWorkbenchOpen } from "@/components/lg/workbench-open-context"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Thread } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ChatCommandPalette({
  open,
  onOpenChange,
  activeThreadId,
  threads,
  onCreateThread,
  onSelectThread,
  onFocusComposer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeThreadId: string
  threads: Thread[]
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onFocusComposer: () => void
}) {
  const workbench = useWorkbenchOpen()
  const { theme, setTheme } = useTheme()
  const activeThreads = threads.filter((thread) => thread.status === "active")

  function closeAndRun(callback: () => void) {
    onOpenChange(false)
    callback()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-3 p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            命令
          </DialogTitle>
          <DialogDescription className="sr-only">
            运行常用操作、切换线程、打开 workbench 或切换主题。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <CommandButton icon={<TerminalSquare className="h-4 w-4" />} onClick={() => closeAndRun(onFocusComposer)}>
            聚焦输入框
          </CommandButton>
          <CommandButton icon={<Plus className="h-4 w-4" />} onClick={() => closeAndRun(onCreateThread)}>
            新建任务线程
          </CommandButton>
          <CommandButton icon={<BookOpen className="h-4 w-4" />} disabled={!workbench} onClick={() => closeAndRun(() => workbench?.openPath())}>
            打开 Workbench
          </CommandButton>
        </div>

        <div className="border-t hairline pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">主题</div>
          <div className="grid grid-cols-3 gap-1">
            <ThemeButton active={theme === "light"} icon={<Sun className="h-3.5 w-3.5" />} onClick={() => setTheme("light")}>
              亮色
            </ThemeButton>
            <ThemeButton active={theme === "dark"} icon={<Moon className="h-3.5 w-3.5" />} onClick={() => setTheme("dark")}>
              暗色
            </ThemeButton>
            <ThemeButton active={theme === "system"} icon={<Check className="h-3.5 w-3.5" />} onClick={() => setTheme("system")}>
              系统
            </ThemeButton>
          </div>
        </div>

        {activeThreads.length > 0 && (
          <div className="border-t hairline pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">切换线程</div>
            <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin">
              {activeThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => closeAndRun(() => onSelectThread(thread.id))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition hover:bg-secondary",
                    thread.id === activeThreadId && "bg-secondary text-foreground",
                  )}
                >
                  {thread.id === activeThreadId && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className={cn("min-w-0 flex-1 truncate", thread.id !== activeThreadId && "ml-5")}>{thread.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CommandButton({
  icon,
  children,
  disabled,
  onClick,
}: {
  icon: ReactNode
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] transition hover:bg-secondary disabled:opacity-45"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  )
}

function ThemeButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition hover:bg-secondary",
        active && "bg-secondary text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
