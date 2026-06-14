"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, Loader2, LogIn, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { login, register } from "@/lib/api"
import { cn } from "@/lib/utils"

type AuthMode = "login" | "register"
const QQ_EMAIL_DOMAIN = "@qq.com"

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "请求失败"
}

function isQqEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(QQ_EMAIL_DOMAIN)
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextPath, setNextPath] = useState("/")
  const isRegister = mode === "register"
  const disabled = useMemo(() => {
    if (!email.trim() || !password) return true
    return isRegister && !inviteCode.trim()
  }, [email, inviteCode, isRegister, password])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const next = params.get("next")
    if (next && next.startsWith("/") && !next.startsWith("//")) setNextPath(next)
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || submitting) return
    if (isRegister && !isQqEmail(email)) {
      setError("仅支持 QQ 邮箱注册")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isRegister) {
        await register({ email, password, inviteCode })
      } else {
        await login({ email, password })
      }
      window.location.href = nextPath
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground">
      <section className="w-full max-w-sm rounded-lg border border-border/70 bg-card/85 p-5 shadow-sm paper sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-normal">LG 工作台</h1>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              登录后访问你的书籍项目和模型配置。
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-lg border border-border/70 bg-background p-1">
          {(["login", "register"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item)
                setError(null)
              }}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-md text-[13px] transition",
                mode === item
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item === "login" ? <LogIn className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {item === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">
              {isRegister ? "注册邮箱（仅 QQ 邮箱）" : "邮箱"}
            </span>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="请输入邮箱"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">密码</span>
            <Input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>

          {isRegister ? (
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">邀请码</span>
              <Input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="请输入邀请码"
              />
            </label>
          ) : null}

          <div className="min-h-5 text-[12px] leading-relaxed">
            {error ? <span className="text-destructive">{error}</span> : null}
          </div>

          <Button type="submit" className="w-full" disabled={disabled || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isRegister ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {submitting ? "处理中..." : isRegister ? "注册并进入" : "登录"}
          </Button>
        </form>
      </section>
    </main>
  )
}
