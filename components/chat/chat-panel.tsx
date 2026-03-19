"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Send,
  Bot,
  User,
  Loader2,
  Trash2,
  Sparkles,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  commands?: ViewerCommand[]
}

export interface ViewerCommand {
  action: string
  params: Record<string, unknown>
}

interface ChatPanelProps {
  modelId: string
  modelContext: ModelContext | null
  onCommand?: (command: ViewerCommand) => void
}

export interface ModelContext {
  fileName: string
  stats: { elementCount: number; levelCount: number } | null
  spatialTree: unknown
  elementSummary: Record<string, number>
  elementList: { expressID: number; type: string; name: string }[]
}

function parseCommands(text: string): ViewerCommand[] {
  const commands: ViewerCommand[] = []
  const regex = /```command\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const cmd = JSON.parse(match[1].trim())
      if (cmd.action) commands.push(cmd)
    } catch {
      // ignore invalid JSON
    }
  }
  return commands
}

function removeCommandBlocks(text: string): string {
  return text.replace(/```command\n[\s\S]*?```/g, "").trim()
}

const SUGGESTION_PROMPTS = [
  "这个建筑有几层？",
  "列出所有构件类型",
  "高亮所有墙体",
  "切换到顶视图",
]

export function ChatPanel({ modelId, modelContext, onCommand }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Load chat history
  useEffect(() => {
    if (historyLoaded) return
    async function loadHistory() {
      try {
        const res = await fetch(`/api/chat?modelId=${modelId}`)
        if (res.ok) {
          const history = await res.json()
          if (history.length > 0) {
            setMessages(
              history.map((h: { id: string; role: string; content: string }) => ({
                id: h.id,
                role: h.role as "user" | "assistant",
                content: h.content,
                commands: h.role === "assistant" ? parseCommands(h.content) : undefined,
              }))
            )
          }
        }
      } catch {
        // ignore
      }
      setHistoryLoaded(true)
    }
    loadHistory()
  }, [modelId, historyLoaded])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
      }

      const newMessages = [...messages, userMessage]
      setMessages(newMessages)
      setInput("")
      setIsStreaming(true)

      // Create placeholder for assistant response
      const assistantId = `assistant-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ])

      try {
        const controller = new AbortController()
        abortRef.current = controller

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            modelContext,
            modelId,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          let errorMsg = "Failed to send message"
          try {
            const err = await res.json()
            errorMsg = err.error || errorMsg
          } catch {
            errorMsg = `Server error (${res.status})`
          }
          throw new Error(errorMsg)
        }

        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let fullText = ""

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6)
                if (data === "[DONE]") continue

                try {
                  const parsed = JSON.parse(data)
                  if (parsed.error) {
                    throw new Error(parsed.error)
                  }
                  if (parsed.text) {
                    fullText += parsed.text
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId
                          ? { ...m, content: fullText }
                          : m
                      )
                    )
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue
                  throw e
                }
              }
            }
          }
        }

        // Parse commands from full response
        const commands = parseCommands(fullText)
        if (commands.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, commands } : m
            )
          )
          // Auto-execute commands
          commands.forEach((cmd) => onCommand?.(cmd))
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
                }
              : m
          )
        )
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, isStreaming, modelContext, modelId, onCommand]
  )

  // Listen for AI insight requests from statistics panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.message) {
        sendMessage(detail.message)
      }
    }
    window.addEventListener("ai-insight-request", handler)
    return () => window.removeEventListener("ai-insight-request", handler)
  }, [sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">AI Assistant</h3>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clearChat}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <Bot className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="mb-1 text-sm font-medium text-muted-foreground">
              AI Model Assistant
            </p>
            <p className="mb-6 text-center text-xs text-muted-foreground/70">
              Ask questions about the model or use natural language to control the viewer
            </p>
            <div className="grid w-full gap-2">
              {SUGGESTION_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => sendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onCommand={onCommand}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the model..."
            rows={1}
            className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!input.trim() || isStreaming}
            onClick={() => sendMessage(input)}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onCommand,
}: {
  message: ChatMessage
  onCommand?: (command: ViewerCommand) => void
}) {
  const isUser = message.role === "user"
  const displayContent = isUser
    ? message.content
    : removeCommandBlocks(message.content)

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[85%] space-y-2",
          isUser && "text-right"
        )}
      >
        <div
          className={cn(
            "inline-block rounded-2xl px-3.5 py-2.5 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{displayContent}</p>
          ) : displayContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
        </div>

        {/* Command badges */}
        {message.commands && message.commands.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.commands.map((cmd, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer gap-1 text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={() => onCommand?.(cmd)}
              >
                <Sparkles className="h-3 w-3" />
                {formatCommandLabel(cmd)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatCommandLabel(cmd: ViewerCommand): string {
  switch (cmd.action) {
    case "highlightByType":
      return `Highlight ${cmd.params.type}`
    case "setView":
      return `${cmd.params.view} view`
    case "toggleWireframe":
      return cmd.params.enabled ? "Wireframe ON" : "Wireframe OFF"
    case "toggleXRay":
      return cmd.params.enabled ? "X-Ray ON" : "X-Ray OFF"
    case "toggleClipping":
      return cmd.params.enabled ? "Section ON" : "Section OFF"
    case "highlightElement":
      return `Highlight #${cmd.params.expressID}`
    case "resetView":
      return "Reset View"
    default:
      return cmd.action
  }
}
