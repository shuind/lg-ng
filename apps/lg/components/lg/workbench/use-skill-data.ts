"use client"

import { useCallback, useEffect, useState } from "react"
import type { Skill } from "@/lib/types"
import { listSkills } from "@/lib/api"

export function useSkillData(bookId: string) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  const loadSkillData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      setSkills(await listSkills(bookId))
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    loadSkillData()
  }, [loadSkillData])

  return {
    skills,
    loading,
    loadSkillData,
  }
}
