import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Box,
  Upload,
  Calendar,
  HardDrive,
  Eye,
} from "lucide-react"
import { DeleteModelButton } from "./delete-model-button"

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user!.id!

  const project = await db.project.findUnique({
    where: { id, userId },
    include: {
      models: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!project) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground">
            {project.description || "No description"}
          </p>
        </div>
        <Link href={`/dashboard/upload?projectId=${project.id}`}>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Model
          </Button>
        </Link>
      </div>

      {project.models.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Box className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="mb-2 text-lg font-semibold">No models yet</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Upload an IFC file to get started
            </p>
            <Link href={`/dashboard/upload?projectId=${project.id}`}>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload IFC Model
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {project.models.map((model: { id: string; fileName: string; fileSize: number; createdAt: Date }) => (
            <Card key={model.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Box className="h-5 w-5 text-blue-500" />
                  </div>
                  <DeleteModelButton modelId={model.id} />
                </div>
                <h3 className="mb-1 truncate font-semibold">{model.fileName}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1">
                    <HardDrive className="h-3 w-3" />
                    {formatFileSize(model.fileSize)}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Calendar className="h-3 w-3" />
                    {model.createdAt.toLocaleDateString()}
                  </Badge>
                </div>
                <Link
                  href={`/dashboard/projects/${id}/viewer/${model.id}`}
                  className="mt-4 block"
                >
                  <Button size="sm" className="w-full gap-2">
                    <Eye className="h-3.5 w-3.5" />
                    Open Viewer
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
