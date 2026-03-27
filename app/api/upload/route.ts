import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { supabase, STORAGE_BUCKET } from "@/lib/supabase"

const useSupabaseStorage = !!process.env.NEXT_PUBLIC_SUPABASE_URL

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const projectId = formData.get("projectId") as string | null

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "File and project ID are required" },
      { status: 400 }
    )
  }

  if (!file.name.toLowerCase().endsWith(".ifc")) {
    return NextResponse.json(
      { error: "Only .ifc files are allowed" },
      { status: 400 }
    )
  }

  // Verify project ownership
  const project = await db.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const bytes = await file.arrayBuffer()
  let fileUrl: string

  if (useSupabaseStorage) {
    // Upload to Supabase Storage
    const storagePath = `${session.user.id}/${uniqueName}`
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, Buffer.from(bytes), {
        contentType: "application/octet-stream",
        upsert: false,
      })

    if (error) {
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath)

    fileUrl = urlData.publicUrl
  } else {
    // Local filesystem (development)
    const uploadsDir = path.join(process.cwd(), "uploads")
    await mkdir(uploadsDir, { recursive: true })

    const filePath = path.join(uploadsDir, uniqueName)
    fileUrl = `/api/uploads/${uniqueName}`

    await writeFile(filePath, Buffer.from(bytes))
  }

  // Create model record
  const model = await db.model.create({
    data: {
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      projectId,
    },
  })

  return NextResponse.json(model, { status: 201 })
}
