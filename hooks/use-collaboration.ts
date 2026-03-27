"use client"

import { useCallback, useState } from "react"
import {
  useUpdateMyPresence,
  useOthers,
  useSelf,
  useBroadcastEvent,
  useEventListener,
} from "@/liveblocks.config"
import { useLiveblocksActive } from "@/components/viewer/liveblocks-room"
import type { CollabAnnotation, CursorPosition } from "@/lib/collaboration/types"

type CollabReturn = {
  connected: boolean
  onlineUsers: { id: string; name: string; email: string; color: string }[]
  remoteCursors: { id: string; name: string; color: string; cursor: CursorPosition }[]
  remoteSelections: Map<string, number | null>
  annotations: CollabAnnotation[]
  sendCursor: (position: CursorPosition) => void
  clearCursor: () => void
  sendSelection: (expressID: number | null) => void
  sendAnnotation: (data: { elementId?: string; content: string; position?: { x: number; y: number; z: number } }) => void
  currentUserId: string
}

// Inactive fallback (no Liveblocks key configured)
function useCollaborationInactive(): CollabReturn {
  return {
    connected: false,
    onlineUsers: [],
    remoteCursors: [],
    remoteSelections: new Map(),
    annotations: [],
    sendCursor: () => {},
    clearCursor: () => {},
    sendSelection: () => {},
    sendAnnotation: () => {},
    currentUserId: "",
  }
}

// Active Liveblocks collaboration
function useCollaborationActive(): CollabReturn {
  const updateMyPresence = useUpdateMyPresence()
  const others = useOthers()
  const self = useSelf()
  const broadcast = useBroadcastEvent()
  const [annotations, setAnnotations] = useState<CollabAnnotation[]>([])

  useEventListener(({ event }) => {
    if (event.type === "annotation") {
      setAnnotations((prev) => [...prev, event.annotation])
    }
  })

  const onlineUsers = [
    ...(self
      ? [{
          id: self.id,
          name: self.info.name,
          email: self.info.email,
          color: self.info.color,
        }]
      : []),
    ...others.map((other) => ({
      id: other.id,
      name: other.info.name,
      email: other.info.email,
      color: other.info.color,
    })),
  ]

  const remoteCursors = others
    .filter((other) => other.presence.cursor !== null)
    .map((other) => ({
      id: other.id,
      name: other.info.name,
      color: other.info.color,
      cursor: other.presence.cursor!,
    }))

  const remoteSelections = new Map<string, number | null>()
  others.forEach((other) => {
    if (other.presence.selectedExpressID !== null) {
      remoteSelections.set(other.id, other.presence.selectedExpressID)
    }
  })

  const sendCursor = useCallback(
    (position: CursorPosition) => {
      updateMyPresence({ cursor: position })
    },
    [updateMyPresence]
  )

  const clearCursor = useCallback(() => {
    updateMyPresence({ cursor: null })
  }, [updateMyPresence])

  const sendSelection = useCallback(
    (expressID: number | null) => {
      updateMyPresence({ selectedExpressID: expressID })
    },
    [updateMyPresence]
  )

  const sendAnnotation = useCallback(
    (data: { elementId?: string; content: string; position?: { x: number; y: number; z: number } }) => {
      if (!self) return

      const annotation: CollabAnnotation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: self.id,
        userName: self.info.name,
        userColor: self.info.color,
        elementId: data.elementId,
        content: data.content,
        position: data.position,
        createdAt: new Date().toISOString(),
      }

      setAnnotations((prev) => [...prev, annotation])
      broadcast({ type: "annotation", annotation })
    },
    [self, broadcast]
  )

  return {
    connected: self !== null,
    onlineUsers,
    remoteCursors,
    remoteSelections,
    annotations,
    sendCursor,
    clearCursor,
    sendSelection,
    sendAnnotation,
    currentUserId: self?.id || "",
  }
}

// Main hook — delegates based on whether Liveblocks is active
export function useCollaboration(): CollabReturn {
  const active = useLiveblocksActive()
  if (active) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useCollaborationActive()
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCollaborationInactive()
}
