"use client"

import { useState, useEffect, useCallback } from "react"
import type { IFCElementInfo, ModelStats } from "@/hooks/use-ifc-loader"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Box, Layers, Hash, Tag, X, MessageSquareText, Send, Loader2, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Comment {
  id: string
  elementId: string | null
  content: string
  createdAt: string
  user: { name: string | null; email: string }
}

interface PropertiesPanelProps {
  selectedElement: IFCElementInfo | null
  modelStats: ModelStats | null
  modelId: string
  onClearSelection: () => void
}

export function PropertiesPanel({
  selectedElement,
  modelStats,
  modelId,
  onClearSelection,
}: PropertiesPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)

  // Load comments when element is selected
  useEffect(() => {
    if (!selectedElement) {
      setComments([])
      return
    }

    setLoadingComments(true)
    fetch(`/api/models/${modelId}/comments?elementId=${selectedElement.expressID}`)
      .then((res) => res.json())
      .then((data) => setComments(data))
      .catch(() => {})
      .finally(() => setLoadingComments(false))
  }, [selectedElement, modelId])

  const handleSubmitComment = useCallback(async () => {
    if (!newComment.trim() || !selectedElement || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/models/${modelId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elementId: String(selectedElement.expressID),
          content: newComment.trim(),
        }),
      })
      if (res.ok) {
        const comment = await res.json()
        setComments((prev) => [comment, ...prev])
        setNewComment("")
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }, [newComment, selectedElement, modelId, submitting])

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      // Optimistic delete
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    },
    []
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h3 className="font-semibold">Properties</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Model stats */}
        {modelStats && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Model Info
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3 text-center">
                <Box className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-lg font-bold">{modelStats.elementCount}</p>
                <p className="text-xs text-muted-foreground">Elements</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Layers className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-lg font-bold">{modelStats.levelCount}</p>
                <p className="text-xs text-muted-foreground">Floors</p>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Selected element */}
        {selectedElement ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Selected Element
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClearSelection}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Name</span>
              </div>
              <p className="text-sm font-medium">{selectedElement.name}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Box className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Type</span>
              </div>
              <Badge variant="secondary">{selectedElement.type}</Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Express ID</span>
              </div>
              <p className="text-sm font-mono">{selectedElement.expressID}</p>
            </div>

            {selectedElement.globalId && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Global ID</span>
                </div>
                <p className="text-sm font-mono break-all">
                  {selectedElement.globalId}
                </p>
              </div>
            )}

            <Separator />

            {/* Annotations Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  Annotations
                </span>
                {comments.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                    {comments.length}
                  </Badge>
                )}
              </div>

              {/* Add annotation input */}
              <div className="flex gap-1.5">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmitComment()
                    }
                  }}
                  placeholder="Add annotation..."
                  rows={2}
                  className="min-h-[56px] flex-1 resize-none rounded-lg border bg-background px-2.5 py-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={submitting}
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0 self-end"
                  disabled={!newComment.trim() || submitting}
                  onClick={handleSubmitComment}
                >
                  {submitting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                </Button>
              </div>

              {/* Comments list */}
              {loadingComments ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-lg border bg-muted/50 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-2.5 w-2.5 text-primary" />
                          </div>
                          <span className="text-[10px] font-medium">
                            {comment.user.name || comment.user.email}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed">{comment.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[11px] text-muted-foreground py-2">
                  No annotations yet
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Box className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Click on a model element to view its properties
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
