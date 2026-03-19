"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Play,
  Loader2,
  FileBox,
  Clock,
  Triangle,
  Box,
  CheckCircle2,
  BarChart3,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts"

interface ModelInfo {
  id: string
  fileName: string
  fileUrl: string
  fileSize: number
  project: { name: string }
}

interface BenchmarkResult {
  modelId: string
  fileName: string
  fileSize: number
  loadTime: number        // ms
  parseTime: number       // ms
  renderTime: number      // ms
  vertexCount: number
  faceCount: number
  meshCount: number
  avgFps: number
  memoryBefore: number    // MB
  memoryAfter: number     // MB
}

export default function BenchmarkPage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<BenchmarkResult[]>([])
  const [running, setRunning] = useState(false)
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        setModels(data)
        // Auto-select all
        setSelectedIds(new Set(data.map((m: ModelInfo) => m.id)))
      })
      .catch(() => {})
  }, [])

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runBenchmark = useCallback(async () => {
    const selected = models.filter((m) => selectedIds.has(m.id))
    if (selected.length === 0) return

    setRunning(true)
    setResults([])
    setProgress({ current: 0, total: selected.length })

    const newResults: BenchmarkResult[] = []

    for (let i = 0; i < selected.length; i++) {
      const model = selected[i]
      setCurrentModel(model.fileName)
      setProgress({ current: i + 1, total: selected.length })

      try {
        const result = await benchmarkSingleModel(model)
        newResults.push(result)
        setResults([...newResults])
      } catch (err) {
        console.warn(`Benchmark failed for ${model.fileName}:`, err)
      }
    }

    setRunning(false)
    setCurrentModel(null)
  }, [models, selectedIds])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">性能基准测试</h2>
        <p className="text-sm text-muted-foreground mt-1">
          对不同 IFC 模型进行加载/渲染性能对比测试，生成论文图表数据
        </p>
      </div>

      {/* Model selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">选择测试模型</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set(models.map((m) => m.id)))}
            >
              全选
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              清空
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => toggleSelection(model.id)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                selectedIds.has(model.id)
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent"
              }`}
              disabled={running}
            >
              <FileBox
                className={`h-5 w-5 shrink-0 ${
                  selectedIds.has(model.id) ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{model.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {(model.fileSize / 1024 / 1024).toFixed(1)} MB · {model.project.name}
                </p>
              </div>
              {selectedIds.has(model.id) && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>

        {models.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无可测试的模型，请先上传 IFC 文件
          </p>
        )}
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={runBenchmark}
          disabled={running || selectedIds.size === 0}
          className="gap-2"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              测试中 ({progress.current}/{progress.total})
              {currentModel && (
                <span className="text-xs opacity-80">- {currentModel}</span>
              )}
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              开始基准测试 ({selectedIds.size} 个模型)
            </>
          )}
        </Button>
      </div>

      {/* Hidden canvas for rendering benchmarks */}
      <div ref={canvasRef} className="h-0 w-0 overflow-hidden" />

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            测试结果
          </h3>

          {/* Summary table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">模型</th>
                  <th className="px-4 py-3 text-right font-medium">文件大小</th>
                  <th className="px-4 py-3 text-right font-medium">加载时间</th>
                  <th className="px-4 py-3 text-right font-medium">解析时间</th>
                  <th className="px-4 py-3 text-right font-medium">渲染时间</th>
                  <th className="px-4 py-3 text-right font-medium">顶点数</th>
                  <th className="px-4 py-3 text-right font-medium">三角面</th>
                  <th className="px-4 py-3 text-right font-medium">平均 FPS</th>
                  <th className="px-4 py-3 text-right font-medium">内存增量</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.modelId} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium truncate max-w-[200px]">
                      {r.fileName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(r.fileSize / 1024 / 1024).toFixed(1)} MB
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTime(r.loadTime)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTime(r.parseTime)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTime(r.renderTime)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(r.vertexCount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(r.faceCount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant={r.avgFps >= 30 ? "default" : "destructive"}
                        className="tabular-nums"
                      >
                        {r.avgFps} fps
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(r.memoryAfter - r.memoryBefore).toFixed(0)} MB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Load time comparison */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold">加载时间对比（毫秒）</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={results.map((r) => ({
                  name: r.fileName.replace(".ifc", ""),
                  加载: r.loadTime,
                  解析: r.parseTime,
                  渲染: r.renderTime,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="加载" fill="#3b82f6" />
                  <Bar dataKey="解析" fill="#8b5cf6" />
                  <Bar dataKey="渲染" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* File size vs load time */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold">文件大小 vs 加载时间</h4>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={results.sort((a, b) => a.fileSize - b.fileSize).map((r) => ({
                  name: r.fileName.replace(".ifc", ""),
                  文件大小MB: +(r.fileSize / 1024 / 1024).toFixed(1),
                  加载时间ms: r.loadTime,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="文件大小MB" stroke="#3b82f6" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="加载时间ms" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Geometry complexity */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold">几何复杂度对比</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={results.map((r) => ({
                  name: r.fileName.replace(".ifc", ""),
                  顶点数K: +(r.vertexCount / 1000).toFixed(0),
                  三角面K: +(r.faceCount / 1000).toFixed(0),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="顶点数K" fill="#f59e0b" />
                  <Bar dataKey="三角面K" fill="#06b6d4" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* FPS comparison */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold">渲染帧率 & 内存使用</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={results.map((r) => ({
                  name: r.fileName.replace(".ifc", ""),
                  平均FPS: r.avgFps,
                  内存增量MB: +(r.memoryAfter - r.memoryBefore).toFixed(0),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="平均FPS" fill="#22c55e" />
                  <Bar dataKey="内存增量MB" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function benchmarkSingleModel(model: ModelInfo): Promise<BenchmarkResult> {
  const memBefore = getMemoryMB()

  // Phase 1: Fetch / load time
  const fetchStart = performance.now()
  const response = await fetch(model.fileUrl)
  if (!response.ok) throw new Error("Failed to fetch")
  const buffer = await response.arrayBuffer()
  const loadTime = Math.round(performance.now() - fetchStart)

  // Phase 2: Parse time (IFC parsing via web-ifc)
  const parseStart = performance.now()
  const WebIFC = await import("web-ifc")
  const ifcApi = new WebIFC.IfcAPI()
  ifcApi.SetWasmPath("/", true)
  await ifcApi.Init((path: string) => "/" + path)
  const data = new Uint8Array(buffer)
  const modelID = ifcApi.OpenModel(data)
  const parseTime = Math.round(performance.now() - parseStart)

  // Phase 3: Render time (create Three.js meshes)
  const renderStart = performance.now()
  const THREE = await import("three")

  let vertexCount = 0
  let faceCount = 0
  let meshCount = 0
  const scene = new THREE.Scene()

  ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
    const placedGeometries = flatMesh.geometries
    for (let i = 0; i < placedGeometries.size(); i++) {
      const placedGeometry = placedGeometries.get(i)
      const geometry = ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID)
      const verts = ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
      const indices = ifcApi.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())

      if (verts.length === 0 || indices.length === 0) {
        geometry.delete()
        continue
      }

      const bufferGeometry = new THREE.BufferGeometry()
      const posArr = new Float32Array(verts.length / 2)
      const normArr = new Float32Array(verts.length / 2)
      for (let j = 0; j < verts.length; j += 6) {
        const idx = j / 6
        posArr[idx * 3] = verts[j]
        posArr[idx * 3 + 1] = verts[j + 1]
        posArr[idx * 3 + 2] = verts[j + 2]
        normArr[idx * 3] = verts[j + 3]
        normArr[idx * 3 + 1] = verts[j + 4]
        normArr[idx * 3 + 2] = verts[j + 5]
      }
      bufferGeometry.setAttribute("position", new THREE.BufferAttribute(posArr, 3))
      bufferGeometry.setAttribute("normal", new THREE.BufferAttribute(normArr, 3))
      bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1))

      const material = new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(bufferGeometry, material)
      const matrix = new THREE.Matrix4()
      matrix.fromArray(placedGeometry.flatTransformation)
      mesh.applyMatrix4(matrix)
      scene.add(mesh)

      vertexCount += posArr.length / 3
      faceCount += indices.length / 3
      meshCount++
      geometry.delete()
    }
  })

  const renderTime = Math.round(performance.now() - renderStart)

  // Phase 4: Measure FPS by rendering a few frames
  const canvas = document.createElement("canvas")
  canvas.width = 800
  canvas.height = 600
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(800, 600)

  const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 2000)
  const box = new THREE.Box3().setFromObject(scene)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim)
  camera.lookAt(center)

  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  scene.add(new THREE.DirectionalLight(0xffffff, 0.8))

  // Render 60 frames and measure FPS
  let frameCount = 0
  const fpsStart = performance.now()
  for (let f = 0; f < 60; f++) {
    // Rotate camera slightly each frame
    const angle = (f / 60) * Math.PI * 2
    camera.position.set(
      center.x + maxDim * Math.cos(angle),
      center.y + maxDim * 0.5,
      center.z + maxDim * Math.sin(angle)
    )
    camera.lookAt(center)
    renderer.render(scene, camera)
    frameCount++
  }
  const fpsElapsed = performance.now() - fpsStart
  const avgFps = Math.round((frameCount / fpsElapsed) * 1000)

  // Cleanup
  renderer.dispose()
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.geometry?.dispose()
      child.material?.dispose()
    }
  })
  ifcApi.CloseModel(modelID)
  try { ifcApi.Dispose() } catch {}

  const memAfter = getMemoryMB()

  return {
    modelId: model.id,
    fileName: model.fileName,
    fileSize: model.fileSize,
    loadTime,
    parseTime,
    renderTime,
    vertexCount,
    faceCount,
    meshCount,
    avgFps,
    memoryBefore: memBefore,
    memoryAfter: memAfter,
  }
}

function getMemoryMB(): number {
  const mem = (performance as any).memory
  if (mem) return Math.round(mem.usedJSHeapSize / 1024 / 1024)
  return 0
}

function formatTime(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s"
  return ms + "ms"
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(0) + "K"
  return String(n)
}
