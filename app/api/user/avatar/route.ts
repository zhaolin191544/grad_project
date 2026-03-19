import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("avatar") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, and GIF images are allowed" },
      { status: 400 }
    )
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File size must be less than 5MB" },
      { status: 400 }
    )
  }

  const avatarsDir = path.join(process.cwd(), "uploads", "avatars")
  await mkdir(avatarsDir, { recursive: true })

  const ext = file.name.split(".").pop() || "jpg"
  const uniqueName = `${session.user.id}-${Date.now()}.${ext}`
  const filePath = path.join(avatarsDir, uniqueName)
  const fileUrl = `/api/uploads/avatars/${uniqueName}`

  const bytes = await file.arrayBuffer()
  await writeFile(filePath, Buffer.from(bytes))

  const user = await db.user.update({
    where: { id: session.user.id },
    data: { image: fileUrl },
    select: { id: true, image: true },
  })

  return NextResponse.json(user)
}
