import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Settings } from "lucide-react"
import { AppSettingsPanel } from "@/components/lg/app-settings-panel"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "设置 | LG",
}

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Button className="h-10 px-4 text-[13px] shadow-sm shadow-primary/15" asChild>
            <Link href="/" aria-label="返回主页">
              <ArrowLeft className="h-5 w-5" />
              返回主页
            </Link>
          </Button>
        </header>

        <div className="rounded-lg border border-border/70 bg-card/80 p-5 paper sm:p-6">
          <div className="mb-6 flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-normal">设置</h1>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                管理当前账号的模型配置。这里的设置会影响你名下所有书籍和线程的 AI 请求。
              </p>
            </div>
          </div>

          <AppSettingsPanel />
        </div>
      </div>
    </main>
  )
}
