import type { ChatReference, ImportedMaterial, SettingCard } from "./types"

export function settingCardToReference(card: SettingCard): ChatReference {
  return {
    id: `setting:${card.id}`,
    kind: "setting",
    type: card.category,
    category: card.category,
    name: card.name,
    aliases: card.aliases,
    summary: card.summary,
    content: card.content,
    path: card.path,
    meta: card.meta,
  }
}

export function importedMaterialToReference(material: ImportedMaterial): ChatReference {
  return {
    id: `material:${material.path}`,
    kind: "material",
    type: "material",
    name: material.name,
    summary: material.summary,
    path: material.path,
    size: material.size,
    updatedAt: material.updatedAt,
  }
}
