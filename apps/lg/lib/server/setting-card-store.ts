import type { SettingCard } from "@/lib/types"
import { listIndexedSettingCards } from "@/lib/server/book-index"

export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  return listIndexedSettingCards(bookId)
}
