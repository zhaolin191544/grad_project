import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 })
  }

  const models = await db.model.findMany({
    where: { project: { userId: session.user.id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileSize: true,
      projectId: true,
      createdAt: true,
      project: { select: { name: true } },
    },
  })

  return NextResponse.json(models)
}
