"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ResponseConstraint, Skill } from "@/lib/types"
import type { WorkflowAction } from "@/lib/types"
import { listSkills } from "@/lib/api"
import type { ChatCitation, ChatSendOptions } from "./types"

type PendingSend = {
  text: string
  citations: ChatCitation[]
  options: Omit<ChatSendOptions, "signal">
}

export function useChatComposerState({
  bookId,
  activeThreadId,
  citations,
  responseConstraints,
  activeResponseConstraintIds,
  sendBlocked = false,
  onSend,
  onClearCitations,
  onSetActiveResponseConstraintIds,
}: {
  bookId: string
  activeThreadId: string
  citations: ChatCitation[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  sendBlocked?: boolean
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onClearCitations: () => void
  onSetActiveResponseConstraintIds: (constraintIds: string[]) => Promise<void>
}) {
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [constraintPickerOpen, setConstraintPickerOpen] = useState(false)
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)
  const [plusTab, setPlusTab] = useState<"constraints" | "skills">("constraints")
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillIds, setSkillIds] = useState<string[]>([])
  const [temporaryConstraints, setTemporaryConstraints] = useState<string[]>([])
  const [readonlyOnly, setReadonlyOnly] = useState(false)
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction | undefined>()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const activeResponseConstraints = useMemo(
    () => responseConstraints.filter((constraint) => activeResponseConstraintIds.includes(constraint.id)),
    [responseConstraints, activeResponseConstraintIds],
  )
  const selectedSkills = useMemo(
    () => skills.filter((skill) => skillIds.includes(skill.id)),
    [skills, skillIds],
  )

  const applySkills = useCallback((items: Skill[]) => {
    setSkills(items)
    setSkillIds((current) => current.filter((id) => items.some((skill) => skill.id === id)))
  }, [])

  const refreshSkills = useCallback(async () => {
    if (!bookId) {
      applySkills([])
      return
    }
    try {
      const items = await listSkills(bookId)
      applySkills(items)
    } catch {
      setSkills([])
    }
  }, [applySkills, bookId])

  useEffect(() => {
    let cancelled = false
    if (!bookId) {
      setSkills([])
      setSkillIds([])
      return
    }

    listSkills(bookId)
      .then((items) => {
        if (cancelled) return
        applySkills(items)
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })

    return () => {
      cancelled = true
    }
  }, [applySkills, bookId])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-chat-popover-keepopen='true']")) return
      setConstraintPickerOpen(false)
      setReferencePickerOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  useEffect(() => {
    setInput("")
    setTemporaryConstraints([])
    setSkillIds([])
    setReadonlyOnly(false)
    setWorkflowAction(undefined)
    setPlusTab("constraints")
    setConstraintPickerOpen(false)
    setReferencePickerOpen(false)
  }, [activeThreadId, bookId])

  const editLatest = useCallback((text: string) => {
    setInput(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const startSend = useCallback(async (payload: PendingSend) => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSending(true)
    try {
      await onSend(payload.text, payload.citations, {
        ...payload.options,
        signal: controller.signal,
      })
      onClearCitations()
      setTemporaryConstraints([])
      setSkillIds([])
      setWorkflowAction(undefined)
    } finally {
      abortControllerRef.current = null
      setSending(false)
    }
  }, [onClearCitations, onSend])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending || sendBlocked) return
    const payload: PendingSend = {
      text,
      citations,
      options: {
        constraintIds: activeResponseConstraintIds,
        temporaryConstraints,
        skillIds,
        readonlyOnly,
        workflowAction,
      },
    }
    setInput("")
    await startSend(payload)
  }, [activeResponseConstraintIds, citations, input, readonlyOnly, sendBlocked, sending, skillIds, startSend, temporaryConstraints, workflowAction])

  const handleCancelSend = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleToggleConstraint = useCallback((constraintId: string) => {
    const next = activeResponseConstraintIds.includes(constraintId)
      ? activeResponseConstraintIds.filter((id) => id !== constraintId)
      : [...activeResponseConstraintIds, constraintId]
    onSetActiveResponseConstraintIds(next)
  }, [activeResponseConstraintIds, onSetActiveResponseConstraintIds])

  const handleAddTemporaryConstraint = useCallback((instruction: string) => {
    const trimmed = instruction.trim()
    if (!trimmed) return
    setTemporaryConstraints((current) => [...current, trimmed])
  }, [])

  const handleToggleSkill = useCallback((skillId: string) => {
    setSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId],
    )
  }, [])

  const handleToggleReadonly = useCallback(() => {
    setReadonlyOnly((current) => !current)
  }, [])

  const handleSelectWorkflowAction = useCallback((action: WorkflowAction) => {
    setWorkflowAction((current) => current === action ? undefined : action)
  }, [])

  const handleClearWorkflowAction = useCallback(() => {
    setWorkflowAction(undefined)
  }, [])

  const handleRemoveConstraint = useCallback((constraintId: string) => {
    onSetActiveResponseConstraintIds(activeResponseConstraintIds.filter((id) => id !== constraintId))
  }, [activeResponseConstraintIds, onSetActiveResponseConstraintIds])

  const handleRemoveTemporaryConstraint = useCallback((index: number) => {
    setTemporaryConstraints((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }, [])

  const handleRemoveSkill = useCallback((skillId: string) => {
    setSkillIds((current) => current.filter((id) => id !== skillId))
  }, [])

  const handleTabChange = useCallback((tab: "constraints" | "skills") => {
    setPlusTab(tab)
    if (tab === "skills") void refreshSkills()
  }, [refreshSkills])

  const handleToggleSkillPicker = useCallback(() => {
    setReferencePickerOpen(false)
    setPlusTab("skills")
    setConstraintPickerOpen((open) => {
      const nextOpen = plusTab === "skills" ? !open : true
      if (nextOpen) void refreshSkills()
      return nextOpen
    })
  }, [plusTab, refreshSkills])

  const handleToggleReferencePicker = useCallback(() => {
    setReferencePickerOpen((open) => !open)
    setConstraintPickerOpen(false)
  }, [])

  return {
    inputRef,
    input,
    sending,
    constraintPickerOpen,
    referencePickerOpen,
    plusTab,
    skills,
    skillIds,
    temporaryConstraints,
    activeResponseConstraints,
    selectedSkills,
    readonlyOnly,
    workflowAction,
    setInput,
    handleTabChange,
    editLatest,
    handleSend,
    handleCancelSend,
    handleToggleConstraint,
    handleAddTemporaryConstraint,
    handleToggleSkill,
    handleToggleReadonly,
    handleSelectWorkflowAction,
    handleClearWorkflowAction,
    handleRemoveConstraint,
    handleRemoveTemporaryConstraint,
    handleRemoveSkill,
    handleToggleSkillPicker,
    handleToggleReferencePicker,
  }
}
