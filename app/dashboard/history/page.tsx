"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Eye,
  MessageSquareText,
  MessageSquare,
  Download,
  Clock,
  FileBox,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const ACTION_CONFIG: Record<
  string,
  { label: string; icon: typeof Eye; color: string }
> = {
  view: { label: "查看模型", icon: Eye, color: "text-blue-500 bg-blue-500/10" },
  annotate: {
    label: "添加批注",
    icon: MessageSquareText,
    color: "text-amber-500 bg-amber-500/10",
  },
  chat: {
    label: "AI 对话",
    icon: MessageSquare,
    color: "text-violet-500 bg-violet-500/10",
  },
  export: {
    label: "导出报表",
    icon: Download,
    color: "text-emerald-500 bg-emerald-500/10",
  },
}

type TabKey = "all" | "view" | "annotate" | "chat" | "export"

const TABS: { key: TabKey; label: string; icon: typeof Eye }[] = [
  { key: "all", label: "全部", icon: Filter },
  { key: "view", label: "查看", icon: Eye },
  { key: "annotate", label: "批注", icon: MessageSquareText },
  { key: "chat", label: "AI 对话", icon: MessageSquare },
  { key: "export", label: "导出", icon: Download },
]

const PAGE_SIZE = 20

interface TimelineItem {
  id: string
  action: string
  detail: string | null
  modelName: string
  projectName: string
  createdAt: string
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString()
}

function groupByDate(items: TimelineItem[]): { label: string; items: TimelineItem[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, TimelineItem[]> = {
    "今天": [],
    "昨天": [],
    "本周": [],
    "更早": [],
  }

  for (const item of items) {
    const d = new Date(item.createdAt)
    if (d >= today) groups["今天"].push(item)
    else if (d >= yesterday) groups["昨天"].push(item)
    else if (d >= weekAgo) groups["本周"].push(item)
    else groups["更早"].push(item)
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export default function HistoryPage() {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)

  // Fetch all history data
  useEffect(() => {
    async function fetchHistory() {
      setLoading(true)
      try {
        const res = await fetch("/api/history/all")
        if (res.ok) {
          const data = await res.json()
          setTimeline(data)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  // Stats
  const stats = useMemo(() => {
    return {
      views: timeline.filter((t) => t.action === "view").length,
      annotations: timeline.filter((t) => t.action === "annotate").length,
      chats: timeline.filter((t) => t.action === "chat").length,
    }
  }, [timeline])

  // Filtered items
  const filtered = useMemo(() => {
    let items = timeline
    if (activeTab !== "all") {
      items = items.filter((t) => t.action === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (t) =>
          t.modelName.toLowerCase().includes(q) ||
          t.projectName.toLowerCase().includes(q) ||
          (t.detail && t.detail.toLowerCase().includes(q))
      )
    }
    return items
  }, [timeline, activeTab, searchQuery])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  // Date-grouped items
  const groups = useMemo(() => groupByDate(paged), [paged])

  // Reset page when filter changes
  useEffect(() => {
    setPage(1)
  }, [activeTab, searchQuery])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">活动历史</h1>
        <p className="text-muted-foreground">
          模型查看、批注、AI 对话的完整记录
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Eye className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.views}</p>
              <p className="text-xs text-muted-foreground">模型查看</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <MessageSquareText className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.annotations}</p>
              <p className="text-xs text-muted-foreground">构件批注</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
              <MessageSquare className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.chats}</p>
              <p className="text-xs text-muted-foreground">AI 对话</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar: tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {key !== "all" && (
                <span className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  activeTab === key ? "bg-primary-foreground/20" : "bg-muted"
                )}>
                  {key === "view" ? stats.views : key === "annotate" ? stats.annotations : key === "chat" ? stats.chats : timeline.filter(t => t.action === key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索模型名称、项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:w-64"
          />
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="mb-2 text-lg font-semibold">
              {searchQuery || activeTab !== "all" ? "没有匹配的记录" : "暂无活动记录"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || activeTab !== "all"
                ? "尝试调整筛选条件"
                : "开始查看模型后，活动历史将显示在这里"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] text-muted-foreground">
                  {group.items.length} 条
                </span>
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.view
                  const Icon = config.icon
                  return (
                    <Card key={item.id} className="transition-colors hover:bg-accent/30">
                      <CardContent className="flex items-start gap-3 p-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">
                              {config.label}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <FileBox className="h-3 w-3" />
                              {item.modelName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              · {item.projectName}
                            </span>
                          </div>
                          {item.detail && (
                            <p className="mt-1 text-xs text-muted-foreground truncate">
                              {item.detail}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-2">
                共 {filtered.length} 条记录
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
