import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FolderOpen, Plus, Calendar } from "lucide-react"
import { CreateProjectDialog } from "./create-project-dialog"

export default async function ProjectsPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { models: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your IFC model projects
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="mb-2 text-lg font-semibold">No projects yet</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Create your first project to start managing IFC models
            </p>
            <CreateProjectDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: { id: string; name: string; description: string | null; updatedAt: Date; _count: { models: number } }) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <Card className="transition-shadow hover:shadow-md h-full">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="secondary">
                      {project._count.models} model{project._count.models !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <h3 className="mb-1 font-semibold">{project.name}</h3>
                  <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                    {project.description || "No description"}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {project.updatedAt.toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
