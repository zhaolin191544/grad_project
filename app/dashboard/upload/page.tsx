"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, FileUp, CheckCircle, AlertCircle } from "lucide-react"

interface Project {
  id: string
  name: string
}

export default function UploadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedProjectId = searchParams.get("projectId")

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(
    preselectedProjectId || ""
  )
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch(() => {})
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile?.name.toLowerCase().endsWith(".ifc")) {
      setFile(droppedFile)
    } else {
      setMessage("Please upload an .ifc file")
      setStatus("error")
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setStatus("idle")
    }
  }

  const handleUpload = async () => {
    if (!file || !selectedProjectId) return

    setUploading(true)
    setStatus("idle")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("projectId", selectedProjectId)

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        setStatus("success")
        setMessage("File uploaded successfully!")
        setFile(null)
        setTimeout(() => {
          router.push(`/dashboard/projects/${selectedProjectId}`)
        }, 1500)
      } else {
        const data = await res.json()
        setStatus("error")
        setMessage(data.error || "Upload failed")
      }
    } catch {
      setStatus("error")
      setMessage("Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload IFC Model</h1>
        <p className="text-muted-foreground">
          Upload an IFC file to one of your projects
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Project</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="project-select">Project</Label>
            <select
              id="project-select"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">Choose a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25"
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <FileUp className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="mb-2 text-sm font-medium">
              Drag and drop your IFC file here
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              or click to browse
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<label />}
            >
              <input
                type="file"
                accept=".ifc"
                className="hidden"
                onChange={handleFileChange}
              />
              Choose file
            </Button>
          </div>

          {file && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              {message}
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {message}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!file || !selectedProjectId || uploading}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
