"use client"

import { useEffect, useRef, useState } from "react"
import { Cpu, Check, ChevronDown } from "lucide-react"
import { getAppSettings, updateAppSettings } from "@/lib/api"
import type { AppModelOption, AppSettingsPayload } from "@/lib/app-settings"
import { toast } from "@/hooks/use-toast"

export function ModelSelector() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAppSettings()
      .then(setSettings)
      .catch((err) => {
        console.error("加载模型设置失败:", err)
      })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (!settings) return null

  const currentModel = settings.modelOptions.find((opt) => opt.id === settings.modelId) || {
    id: settings.modelId,
    label: settings.modelId,
    description: "",
  }

  async function handleSelectModel(modelOption: AppModelOption) {
    if (loading || modelOption.id === settings?.modelId) return
    setLoading(true)
    setOpen(false)
    try {
      const payload = await updateAppSettings({
        provider: modelOption.provider,
        modelId: modelOption.id,
      })
      setSettings(payload)
      toast({
        title: "模型切换成功",
        description: `已切换至 ${modelOption.label}`,
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "切换模型失败",
        description: err instanceof Error ? err.message : "未知错误",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        title="切换AI模型"
      >
        <Cpu className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{currentModel.label}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 w-72 rounded-lg border border-border/70 bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">
          <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            切换AI模型
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-thin">
            {settings.modelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectModel(option)}
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
              >
                <div className="flex items-center gap-2 font-medium">
                  {option.id === settings.modelId ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{option.label}</span>
                </div>
                {option.description && (
                  <div className="pl-[22px] text-[10.5px] text-muted-foreground/80 leading-normal">
                    {option.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}