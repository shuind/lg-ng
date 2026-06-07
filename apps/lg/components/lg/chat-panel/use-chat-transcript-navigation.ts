"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message } from "@/lib/mock-data"

export function useChatTranscriptNavigation({
  bookId,
  activeThreadId,
  messages,
  selectedTurnId,
  runningTurnId,
}: {
  bookId: string
  activeThreadId: string
  messages: Message[]
  selectedTurnId: string | null
  runningTurnId?: string
}) {
  const [highlightedUserTurnId, setHighlightedUserTurnId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userMessageRefs = useRef(new Map<string, HTMLDivElement>())
  const highlightResetRef = useRef<number | null>(null)
  const questionJumpRef = useRef<{ sourceTurnId: string; offset: number } | null>(null)
  const latestUserTurnId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role === "user") return message.turnId
    }
    return null
  }, [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, runningTurnId])

  useEffect(() => {
    return () => {
      if (highlightResetRef.current) window.clearTimeout(highlightResetRef.current)
    }
  }, [])

  useEffect(() => {
    questionJumpRef.current = null
  }, [activeThreadId, bookId])

  const registerUserMessage = useCallback((turnId: string, element: HTMLDivElement | null) => {
    if (element) {
      userMessageRefs.current.set(turnId, element)
    } else {
      userMessageRefs.current.delete(turnId)
    }
  }, [])

  const scrollToUserTurn = useCallback((turnId: string) => {
    const target = userMessageRefs.current.get(turnId)
    if (!target) return

    target.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedUserTurnId(turnId)
    if (highlightResetRef.current) window.clearTimeout(highlightResetRef.current)
    highlightResetRef.current = window.setTimeout(() => {
      setHighlightedUserTurnId((current) => (current === turnId ? null : current))
    }, 1400)
  }, [])

  const jumpToQuestionFromTurn = useCallback((sourceTurnId: string) => {
    const userTurnIds: string[] = []
    const seenTurnIds = new Set<string>()
    for (const message of messages) {
      if (message.role !== "user" || seenTurnIds.has(message.turnId)) continue
      seenTurnIds.add(message.turnId)
      userTurnIds.push(message.turnId)
    }

    const sourceIndex = userTurnIds.lastIndexOf(sourceTurnId)
    if (sourceIndex < 0) return

    const previousJump = questionJumpRef.current
    const nextOffset = previousJump?.sourceTurnId === sourceTurnId
      ? Math.min(previousJump.offset + 1, sourceIndex)
      : 0
    const targetTurnId = userTurnIds[sourceIndex - nextOffset]
    if (!targetTurnId) return

    questionJumpRef.current = { sourceTurnId, offset: nextOffset }
    scrollToUserTurn(targetTurnId)
  }, [messages, scrollToUserTurn])

  const handleQuestionJump = useCallback(() => {
    const sourceTurnId = selectedTurnId && messages.some((message) => message.turnId === selectedTurnId)
      ? selectedTurnId
      : latestUserTurnId
    if (!sourceTurnId) return

    jumpToQuestionFromTurn(sourceTurnId)
  }, [jumpToQuestionFromTurn, latestUserTurnId, messages, selectedTurnId])

  return {
    scrollRef,
    latestUserTurnId,
    highlightedUserTurnId,
    registerUserMessage,
    handleQuestionJump,
  }
}
