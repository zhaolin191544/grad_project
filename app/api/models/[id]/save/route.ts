import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { writeFile } from "fs/promises"
import path from "path"

// PUT: Overwrite model file with modified version
export async function PUT(
  req: Request,
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

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  // Write the new file content to the existing file path
  const fileUrl = model.fileUrl.replace("/api/uploads/", "")
  const filePath = path.join(process.cwd(), "uploads", fileUrl)

  console.log("[SAVE-API] model.id:", id)
  console.log("[SAVE-API] model.fileUrl:", model.fileUrl)
  console.log("[SAVE-API] resolved fileUrl:", fileUrl)
  console.log("[SAVE-API] writing to:", filePath)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)
  console.log("[SAVE-API] wrote", buffer.length, "bytes")

  // Update file size in database
  await db.model.update({
    where: { id },
    data: { fileSize: buffer.length },
  })

  // Record save action in history
  await db.viewHistory.create({
    data: {
      modelId: id,
      userId: session.user.id,
      action: "export",
      detail: "保存修改到原模型",
    },
  })

  return NextResponse.json({ success: true, fileSize: buffer.length })
}
