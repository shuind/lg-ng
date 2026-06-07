"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Skill } from "@/lib/types"
import { getStyleGuideSkill, listSkills, refreshStyleGuideSummary } from "@/lib/api"

export function useSkillData(bookId: string) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [summary, setSummary] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const styleSkill = useMemo(
    () => skills.find((skill) => skill.type === "style_guide" || skill.source === "style_guide") ?? null,
    [skills],
  )

  const loadSkillData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [skillList, style] = await Promise.all([listSkills(bookId), getStyleGuideSkill(bookId)])
      setSkills(skillList.some((skill) => skill.id === style.skill.id) ? skillList : [style.skill, ...skillList])
      setSummary(style.summary)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    loadSkillData()
  }, [loadSkillData])

  const refreshStyleGuide = useCallback(async () => {
    setRefreshing(true)
    try {
      const { skill: refreshedSkill, summary: refreshedSummary } = await refreshStyleGuideSummary(bookId)
      setSkills((current) =>
        current.some((skill) => skill.id === refreshedSkill.id)
          ? current.map((skill) => (skill.id === refreshedSkill.id ? refreshedSkill : skill))
          : [refreshedSkill, ...current],
      )
      setSummary(refreshedSummary)
    } finally {
      setRefreshing(false)
    }
  }, [bookId])

  return {
    skills,
    summary,
    loading,
    refreshing,
    styleSkill,
    loadSkillData,
    refreshStyleGuide,
  }
}
