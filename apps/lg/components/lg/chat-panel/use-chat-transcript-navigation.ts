"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message } from "@/lib/types"

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
  const liveTailRef = useRef<HTMLDivElement>(null)
  const userMessageRefs = useRef(new Map<string, HTMLDivElement>())
  const followOutputRef = useRef(true)
  const highlightResetRef = useRef<number | null>(null)
  const questionJumpRef = useRef<{ sourceTurnId: string; offset: number } | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const latestUserTurnRef = useRef<string | null>(null)
  const latestUserTurnId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role === "user") return message.turnId
    }
    return null
  }, [messages])

  const isNearBottom = useCallback((element: HTMLDivElement, threshold = 96) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    return maxScrollTop - element.scrollTop < threshold
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }

    const applyScroll = () => {
      const scroller = scrollRef.current
      if (!scroller || !followOutputRef.current) return
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      applyScroll()
    })
  }, [])

  useEffect(() => {
    if (!followOutputRef.current) return
    scrollToBottom()
  }, [messages.length, runningTurnId, scrollToBottom])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const element = scroller

    function handleScroll() {
      followOutputRef.current = isNearBottom(element)
    }

    handleScroll()
    element.addEventListener("scroll", handleScroll, { passive: true })
    return () => element.removeEventListener("scroll", handleScroll)
  }, [bookId, activeThreadId, isNearBottom])

  useEffect(() => {
    return () => {
      if (highlightResetRef.current) window.clearTimeout(highlightResetRef.current)
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [])

  useEffect(() => {
    questionJumpRef.current = null
    followOutputRef.current = true
    latestUserTurnRef.current = null
    scrollToBottom()
  }, [activeThreadId, bookId, scrollToBottom])

  useEffect(() => {
    const previousTurnId = latestUserTurnRef.current
    if (previousTurnId === latestUserTurnId) return

    latestUserTurnRef.current = latestUserTurnId
    if (previousTurnId && latestUserTurnId) {
      followOutputRef.current = true
      scrollToBottom()
    }
  }, [latestUserTurnId, scrollToBottom])

  useEffect(() => {
    const tail = liveTailRef.current
    if (!tail || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      const scroller = scrollRef.current
      if (!scroller) return
      if (!followOutputRef.current) return
      scrollToBottom()
    })

    observer.observe(tail)
    scrollToBottom()
    return () => observer.disconnect()
  }, [bookId, activeThreadId, runningTurnId, scrollToBottom])

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

    followOutputRef.current = false
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
    liveTailRef,
    latestUserTurnId,
    highlightedUserTurnId,
    registerUserMessage,
    handleQuestionJump,
  }
}
