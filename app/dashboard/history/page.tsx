import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Eye,
  MessageSquareText,
  MessageSquare,
  Download,
  Clock,
  FileBox,
} from "lucide-react"

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

function formatRelativeTime(date: Date): string {
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

export default async function HistoryPage() {
  const session = await auth()
  const userId = session!.user!.id!

  // Fetch recent activities
  const viewHistory = await db.viewHistory.findMany({
    where: { userId },
    include: {
      model: {
        select: { fileName: true, projectId: true, project: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  // Fetch recent comments
  const recentComments = await db.modelComment.findMany({
    where: { userId },
    include: {
      model: {
        select: { fileName: true, projectId: true, project: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  // Fetch recent chat messages (user role only)
  const recentChats = await db.chatHistory.findMany({
    where: { userId, role: "user" },
    include: {
      model: {
        select: { fileName: true, projectId: true, project: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  // Merge all activities into a unified timeline
  type TimelineItem = {
    id: string
    action: string
    detail: string | null
    modelName: string
    projectName: string
    createdAt: Date
  }

  const timeline: TimelineItem[] = []

  for (const v of viewHistory) {
    timeline.push({
      id: v.id,
      action: v.action,
      detail: v.detail,
      modelName: v.model.fileName,
      projectName: v.model.project.name,
      createdAt: v.createdAt,
    })
  }

  for (const c of recentComments) {
    // Only add if not already tracked in viewHistory
    const alreadyTracked = viewHistory.some(
      (v) =>
        v.action === "annotate" &&
        Math.abs(v.createdAt.getTime() - c.createdAt.getTime()) < 2000
    )
    if (!alreadyTracked) {
      timeline.push({
        id: `comment-${c.id}`,
        action: "annotate",
        detail: `Element ${c.elementId || "general"}: ${c.content.substring(0, 100)}`,
        modelName: c.model.fileName,
        projectName: c.model.project.name,
        createdAt: c.createdAt,
      })
    }
  }

  for (const ch of recentChats) {
    timeline.push({
      id: `chat-${ch.id}`,
      action: "chat",
      detail: ch.content.substring(0, 100),
      modelName: ch.model.fileName,
      projectName: ch.model.project.name,
      createdAt: ch.createdAt,
    })
  }

  // Sort by date descending
  timeline.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // Stats
  const stats = {
    views: viewHistory.filter((v) => v.action === "view").length,
    annotations: recentComments.length,
    chats: recentChats.length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity History</h1>
        <p className="text-muted-foreground">
          Your recent viewing, annotation, and AI chat history
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

      {/* Timeline */}
      {timeline.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="mb-2 text-lg font-semibold">No activity yet</h3>
            <p className="text-sm text-muted-foreground">
              Start viewing models to see your activity history here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {timeline.slice(0, 50).map((item) => {
            const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.view
            const Icon = config.icon
            return (
              <Card key={item.id}>
                <CardContent className="flex items-start gap-3 p-4">
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
      )}
    </div>
  )
}
