import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET: List activity history for current user
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get("modelId")
  const limit = parseInt(searchParams.get("limit") || "50")

  const history = await db.viewHistory.findMany({
    where: {
      userId: session.user.id,
      ...(modelId && { modelId }),
    },
    include: {
      model: { select: { fileName: true, projectId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json(history)
}

// POST: Record a history entry
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { modelId, action, detail } = await req.json()

  if (!modelId || !action) {
    return NextResponse.json({ error: "modelId and action required" }, { status: 400 })
  }

  const entry = await db.viewHistory.create({
    data: {
      modelId,
      userId: session.user.id,
      action,
      detail: detail || null,
    },
  })

  return NextResponse.json(entry)
}
