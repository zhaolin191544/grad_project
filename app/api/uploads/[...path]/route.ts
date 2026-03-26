import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ifc": "application/octet-stream",
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params

  // Prevent directory traversal
  const safePath = segments.map((s) => s.replace(/\.\./g, "")).join("/")
  const filePath = path.join(process.cwd(), "uploads", safePath)

  try {
    const data = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || "application/octet-stream"

    // IFC files must not be cached aggressively because they can be modified via save
    const cacheControl = ext === ".ifc"
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=31536000, immutable"

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}
