"use client"

import { memo } from "react"
import type { Message } from "@/lib/mock-data"
import { AssistantMessageBubble } from "./assistant-message-bubble"
import { UserMessageBubble } from "./user-message-bubble"

export const MessageBubble = memo(function MessageBubble({
  message,
  selected,
  isLatestUser,
  highlightedUser,
  registerUserMessage,
  onSelectTurn,
  onForkThread,
  onEditLatest,
}: {
  message: Message
  selected: boolean
  isLatestUser: boolean
  highlightedUser: boolean
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  onEditLatest: (content: string) => void
}) {
  if (message.role === "user") {
    return (
      <UserMessageBubble
        message={message}
        selected={selected}
        isLatestUser={isLatestUser}
        highlightedUser={highlightedUser}
        registerUserMessage={registerUserMessage}
        onSelectTurn={onSelectTurn}
        onEditLatest={onEditLatest}
      />
    )
  }

  return (
    <AssistantMessageBubble
      message={message}
      selected={selected}
      onSelectTurn={onSelectTurn}
      onForkThread={onForkThread}
    />
  )
})
