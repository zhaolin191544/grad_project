import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET: List comments for a model (optionally filter by elementId)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const elementId = searchParams.get("elementId")

  const comments = await db.modelComment.findMany({
    where: {
      modelId: id,
      ...(elementId && { elementId }),
    },
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(comments)
}

// POST: Create a comment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { elementId, content, position } = await req.json()

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 })
  }

  const comment = await db.modelComment.create({
    data: {
      modelId: id,
      userId: session.user.id,
      elementId: elementId || null,
      content: content.trim(),
      position: position || null,
    },
    include: {
      user: { select: { name: true, email: true } },
    },
  })

  // Record activity
  await db.viewHistory.create({
    data: {
      modelId: id,
      userId: session.user.id,
      action: "annotate",
      detail: `Added annotation on element ${elementId || "general"}: ${content.trim().substring(0, 100)}`,
    },
  })

  return NextResponse.json(comment)
}
