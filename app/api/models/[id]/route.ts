import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { unlink } from "fs/promises"
import path from "path"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const model = await db.model.findFirst({
    where: {
      id,
      project: { userId: session.user.id },
    },
  })

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 })
  }

  // Delete file from disk
  try {
    const filePath = path.join(process.cwd(), model.fileUrl)
    await unlink(filePath)
  } catch {
    // File may not exist, continue
  }

  await db.model.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
