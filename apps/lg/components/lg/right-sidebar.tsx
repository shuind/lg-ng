"use client"

import { useState } from "react"
import { Clock3, Library } from "lucide-react"
import type { LedgerEntry, SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { RecentChangesView } from "./right-sidebar/recent-changes-view"
import { SettingsView } from "./right-sidebar/settings-view"

interface RightSidebarProps {
  cards: SettingCard[]
  ledgerEntries: LedgerEntry[]
  rollingBackEntryId?: string | null
  onCite: (card: SettingCard) => void
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
}

export function RightSidebar({
  cards,
  ledgerEntries,
  rollingBackEntryId,
  onCite,
  onOpenFile,
  onRollbackEntry,
}: RightSidebarProps) {
  const [tab, setTab] = useState<"recent" | "settings">("recent")

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col bg-sidebar/80 paper-soft">
      <div className="shrink-0 px-4 pt-5 pb-3">
        <div className="flex items-center gap-1">
          <TabBtn active={tab === "recent"} onClick={() => setTab("recent")} icon={<Clock3 className="h-3.5 w-3.5" />}>
            最近改动
          </TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<Library className="h-3.5 w-3.5" />}>
            设定卡
          </TabBtn>
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
        {tab === "recent" ? (
          <RecentChangesView
            entries={ledgerEntries}
            rollingBackEntryId={rollingBackEntryId}
            onOpenFile={onOpenFile}
            onRollbackEntry={onRollbackEntry}
          />
        ) : (
          <SettingsView cards={cards} onCite={onCite} />
        )}
      </div>
    </aside>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
