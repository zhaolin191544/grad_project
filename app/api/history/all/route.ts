import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET: Merged timeline of all user activities
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const [viewHistory, recentComments, recentChats] = await Promise.all([
    db.viewHistory.findMany({
      where: { userId },
      include: {
        model: {
          select: { fileName: true, projectId: true, project: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.modelComment.findMany({
      where: { userId },
      include: {
        model: {
          select: { fileName: true, projectId: true, project: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.chatHistory.findMany({
      where: { userId, role: "user" },
      include: {
        model: {
          select: { fileName: true, projectId: true, project: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  type TimelineItem = {
    id: string
    action: string
    detail: string | null
    modelName: string
    projectName: string
    createdAt: string
  }

  const timeline: TimelineItem[] = []

  for (const v of viewHistory) {
    timeline.push({
      id: v.id,
      action: v.action,
      detail: v.detail,
      modelName: v.model.fileName,
      projectName: v.model.project.name,
      createdAt: v.createdAt.toISOString(),
    })
  }

  for (const c of recentComments) {
    const alreadyTracked = viewHistory.some(
      (v: { action: string; createdAt: Date }) =>
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
        createdAt: c.createdAt.toISOString(),
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
      createdAt: ch.createdAt.toISOString(),
    })
  }

  timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json(timeline)
}
