import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { AdminPanel } from "@/components/lg/admin-panel"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "后台 | LG",
}

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              返回工作台
            </Link>
          </Button>
        </header>

        <section className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal">后台</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              内测账号、邀请码、数据和模型配置状态。
            </p>
          </div>
        </section>

        <AdminPanel />
      </div>
    </main>
  )
}
