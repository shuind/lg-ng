"use client"

import { useState } from "react"
import { BookOpenCheck, Clock3, Library, UploadCloud } from "lucide-react"
import type { ImportMaterialsResponse } from "@/lib/api/imports"
import type { Chapter } from "@/lib/types"
import type { ImportedMaterial, LedgerEntry, SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BookStatusView } from "./right-sidebar/book-status-view"
import { ImportMaterialsView } from "./right-sidebar/import-materials-view"
import { RecentChangesView } from "./right-sidebar/recent-changes-view"
import { SettingsView } from "./right-sidebar/settings-view"

interface RightSidebarProps {
  activeBookId: string
  chapters: Chapter[]
  cards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  ledgerEntries: LedgerEntry[]
  rollingBackEntryId?: string | null
  onCite: (card: SettingCard) => void
  onCiteMaterial: (material: ImportedMaterial) => void
  onImportMaterials: (files: File[]) => Promise<ImportMaterialsResponse>
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
}

export function RightSidebar({
  activeBookId,
  chapters,
  cards,
  importedMaterials,
  ledgerEntries,
  rollingBackEntryId,
  onCite,
  onCiteMaterial,
  onImportMaterials,
  onOpenFile,
  onRollbackEntry,
}: RightSidebarProps) {
  const [tab, setTab] = useState<"recent" | "settings" | "import" | "status">("recent")

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col bg-sidebar/70 paper-soft">
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="flex min-w-0 items-center gap-1 border-b border-border/50 pb-3">
          <TabBtn active={tab === "recent"} onClick={() => setTab("recent")} icon={<Clock3 className="h-3.5 w-3.5" />}>
            最近改动
          </TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<Library className="h-3.5 w-3.5" />}>
            设定卡
          </TabBtn>
          <TabBtn active={tab === "status"} onClick={() => setTab("status")} icon={<BookOpenCheck className="h-3.5 w-3.5" />}>
            书状态
          </TabBtn>
          <TabBtn active={tab === "import"} onClick={() => setTab("import")} icon={<UploadCloud className="h-3.5 w-3.5" />}>
            导入
          </TabBtn>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-6 pt-1">
        {tab === "recent" ? (
          <RecentChangesView
            entries={ledgerEntries}
            rollingBackEntryId={rollingBackEntryId}
            onOpenFile={onOpenFile}
            onRollbackEntry={onRollbackEntry}
          />
        ) : tab === "settings" ? (
          <SettingsView cards={cards} onCite={onCite} />
        ) : tab === "import" ? (
          <ImportMaterialsView
            bookId={activeBookId}
            materials={importedMaterials}
            onImportMaterials={onImportMaterials}
            onCiteMaterial={onCiteMaterial}
            onOpenFile={onOpenFile}
          />
        ) : (
          <BookStatusView bookId={activeBookId} chapters={chapters} onOpenFile={onOpenFile} />
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
        "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] transition",
        active
          ? "bg-sidebar-accent font-medium text-foreground shadow-sm ring-1 ring-border/50"
          : "text-muted-foreground/80 hover:bg-sidebar-accent/30 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
