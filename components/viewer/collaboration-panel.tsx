"use client"

import { useState, useRef, useEffect } from "react"
import { Send, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CollabUser, CollabAnnotation } from "@/lib/collaboration/types"
import { cn } from "@/lib/utils"

interface CollaborationPanelProps {
  onlineUsers: CollabUser[]
  currentUserId: string
  annotations: CollabAnnotation[]
  onAddAnnotation: (data: {
    elementId?: string
    content: string
    position?: { x: number; y: number; z: number }
  }) => void
  selectedElementId?: string
}

export function CollaborationPanel({
  onlineUsers,
  currentUserId,
  annotations,
  onAddAnnotation,
  selectedElementId,
}: CollaborationPanelProps) {
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [annotations])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    onAddAnnotation({
      content: input.trim(),
      elementId: selectedElementId || undefined,
    })
    setInput("")
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-3">
        <h3 className="text-sm font-semibold">Collaboration</h3>
      </div>

      {/* Online Users */}
      <div className="border-b p-3">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">
          Online ({onlineUsers.length})
        </h4>
        <div className="flex flex-wrap gap-2">
          {onlineUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-1.5 rounded-full border px-2 py-0.5"
            >
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: user.color }}
              />
              <span className="text-xs">
                {user.name}
                {user.id === currentUserId && " (you)"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Annotations List */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {annotations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            No annotations yet. Add one below.
          </p>
        )}
        {annotations.map((ann) => {
          const isMe = ann.userId === currentUserId

          return (
            <div key={ann.id} className="group">
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: ann.userColor || "#888" }}
                >
                  {ann.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium">
                      {ann.userName}
                      {isMe && " (you)"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(ann.createdAt)}
                    </span>
                  </div>
                  {ann.elementId && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        Element #{ann.elementId}
                      </span>
                    </div>
                  )}
                  <p className="text-xs mt-0.5 break-words">{ann.content}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-3">
        {selectedElementId && (
          <div className="flex items-center gap-1 mb-2 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3" />
            Annotating element #{selectedElementId}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add annotation..."
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" size="icon" className="h-7 w-7 shrink-0" disabled={!input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>
    </div>
  )
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
