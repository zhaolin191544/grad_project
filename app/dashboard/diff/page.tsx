"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  GitCompareArrows,
  Play,
  Loader2,
  FileBox,
  ArrowRight,
  Plus,
  Minus,
  RefreshCw,
  Equal,
  ChevronDown,
  ChevronRight,
  Eye,
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
  PieChart,
  Pie,
  Cell,
} from "recharts"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { extractElements, compareModels, type DiffResult, type DiffItem } from "@/lib/diff/ifc-diff"

interface ModelInfo {
  id: string
  fileName: string
  fileUrl: string
  fileSize: number
  project: { name: string }
}

const DIFF_COLORS = {
  added: "#22c55e",
  removed: "#ef4444",
  modified: "#eab308",
  unchanged: "#94a3b8",
}

export default function DiffPage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [oldModelId, setOldModelId] = useState("")
  const [newModelId, setNewModelId] = useState("")
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("")
  const [result, setResult] = useState<DiffResult | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<"all" | "added" | "removed" | "modified">("all")
  const canvasRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then(setModels)
      .catch(() => {})
  }, [])

  // Initialize 3D scene
  const initScene = useCallback(() => {
    const container = canvasRef.current
    if (!container || rendererRef.current) return

    const w = container.clientWidth
    const h = container.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf1f5f9)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000)
    camera.position.set(30, 30, 30)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(50, 50, 50)
    scene.add(dirLight)

    const grid = new THREE.GridHelper(100, 50, 0xcccccc, 0xe5e5e5)
    scene.add(grid)

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      const nw = container.clientWidth
      const nh = container.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      cancelAnimationFrame(animFrameRef.current)
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const cleanup = initScene()
    return cleanup
  }, [initScene])

  const runDiff = useCallback(async () => {
    if (!oldModelId || !newModelId || oldModelId === newModelId) return

    setRunning(true)
    setResult(null)
    setStatus("加载旧版本模型...")

    try {
      const oldModel = models.find((m) => m.id === oldModelId)!
      const newModel = models.find((m) => m.id === newModelId)!

      // Load old model
      const WebIFC = await import("web-ifc")
      const ifcApi = new WebIFC.IfcAPI()
      ifcApi.SetWasmPath("/", true)
      await ifcApi.Init((path: string) => "/" + path)

      setStatus("解析旧版本 IFC 文件...")
      const oldBuf = await (await fetch(oldModel.fileUrl)).arrayBuffer()
      const oldModelID = ifcApi.OpenModel(new Uint8Array(oldBuf))
      const oldElements = extractElements(ifcApi, oldModelID)

      setStatus("加载新版本模型...")
      const newBuf = await (await fetch(newModel.fileUrl)).arrayBuffer()
      const newModelID = ifcApi.OpenModel(new Uint8Array(newBuf))

      setStatus("解析新版本 IFC 文件...")
      const newElements = extractElements(ifcApi, newModelID)

      setStatus("对比模型差异...")
      const diffResult = compareModels(oldElements, newElements)

      setResult(diffResult)

      // Visualize diff in 3D
      setStatus("生成 3D 差异可视化...")
      visualizeDiff(ifcApi, oldModelID, newModelID, diffResult)

      // Cleanup IFC
      ifcApi.CloseModel(oldModelID)
      ifcApi.CloseModel(newModelID)
      try { ifcApi.Dispose() } catch {}

      setStatus("")
    } catch (err) {
      setStatus(`错误: ${err instanceof Error ? err.message : "对比失败"}`)
    } finally {
      setRunning(false)
    }
  }, [oldModelId, newModelId, models])

  const visualizeDiff = useCallback(
    (ifcApi: any, oldModelID: number, newModelID: number, diff: DiffResult) => {
      const scene = sceneRef.current
      if (!scene) return

      // Clear previous meshes (keep lights and grid)
      const toRemove: THREE.Object3D[] = []
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
          if (child.name.startsWith("diff-")) toRemove.push(child)
        }
      })
      toRemove.forEach((obj) => scene.remove(obj))

      const group = new THREE.Group()
      group.name = "diff-group"

      // Helper: create meshes for elements with a given color
      const addElementMeshes = (
        apiModelID: number,
        expressIDs: number[],
        color: string,
        opacity: number
      ) => {
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          transparent: opacity < 1,
          opacity,
          side: THREE.DoubleSide,
        })

        const eidSet = new Set(expressIDs)

        ifcApi.StreamAllMeshes(apiModelID, (flatMesh: any) => {
          if (!eidSet.has(flatMesh.expressID)) return

          const geoms = flatMesh.geometries
          for (let i = 0; i < geoms.size(); i++) {
            const pg = geoms.get(i)
            const geom = ifcApi.GetGeometry(apiModelID, pg.geometryExpressID)
            const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
            const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())

            if (verts.length === 0 || indices.length === 0) { geom.delete(); continue }

            const bufGeom = new THREE.BufferGeometry()
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
            bufGeom.setAttribute("position", new THREE.BufferAttribute(posArr, 3))
            bufGeom.setAttribute("normal", new THREE.BufferAttribute(normArr, 3))
            bufGeom.setIndex(new THREE.BufferAttribute(indices, 1))

            const mesh = new THREE.Mesh(bufGeom, mat)
            const matrix = new THREE.Matrix4()
            matrix.fromArray(pg.flatTransformation)
            mesh.applyMatrix4(matrix)
            mesh.name = `diff-mesh`
            group.add(mesh)
            geom.delete()
          }
        })
      }

      // Render unchanged from new model (grey, semi-transparent)
      const unchangedIds = diff.unchanged.map((d) => d.otherExpressID!).filter(Boolean)
      addElementMeshes(newModelID, unchangedIds, DIFF_COLORS.unchanged, 0.15)

      // Render added (green) from new model
      const addedIds = diff.added.map((d) => d.element.expressID)
      addElementMeshes(newModelID, addedIds, DIFF_COLORS.added, 0.85)

      // Render removed (red) from old model
      const removedIds = diff.removed.map((d) => d.element.expressID)
      addElementMeshes(oldModelID, removedIds, DIFF_COLORS.removed, 0.85)

      // Render modified (yellow) from new model
      const modifiedNewIds = diff.modified.map((d) => d.otherExpressID!).filter(Boolean)
      addElementMeshes(newModelID, modifiedNewIds, DIFF_COLORS.modified, 0.85)

      scene.add(group)

      // Frame the scene
      const box = new THREE.Box3().setFromObject(group)
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const camera = cameraRef.current!
        camera.position.set(center.x + maxDim, center.y + maxDim * 0.7, center.z + maxDim)
        camera.lookAt(center)
        controlsRef.current?.target.copy(center)
      }
    },
    []
  )

  const filteredItems = result
    ? filter === "all"
      ? [...result.added, ...result.removed, ...result.modified]
      : filter === "added"
        ? result.added
        : filter === "removed"
          ? result.removed
          : result.modified
    : []

  const pieData = result
    ? [
        { name: "新增", value: result.summary.addedCount, color: DIFF_COLORS.added },
        { name: "删除", value: result.summary.removedCount, color: DIFF_COLORS.removed },
        { name: "修改", value: result.summary.modifiedCount, color: DIFF_COLORS.modified },
        { name: "未变", value: result.summary.unchangedCount, color: DIFF_COLORS.unchanged },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <GitCompareArrows className="h-6 w-6" />
          模型版本对比
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          选择两个 IFC 模型版本，自动检测构件变更
        </p>
      </div>

      {/* Model Selection */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            旧版本 (Base)
          </label>
          <select
            value={oldModelId}
            onChange={(e) => setOldModelId(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={running}
          >
            <option value="">选择旧版本模型...</option>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={m.id === newModelId}>
                {m.fileName} ({(m.fileSize / 1024 / 1024).toFixed(1)}MB) - {m.project.name}
              </option>
            ))}
          </select>
        </div>

        <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mb-2.5" />

        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            新版本 (Compare)
          </label>
          <select
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={running}
          >
            <option value="">选择新版本模型...</option>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={m.id === oldModelId}>
                {m.fileName} ({(m.fileSize / 1024 / 1024).toFixed(1)}MB) - {m.project.name}
              </option>
            ))}
          </select>
        </div>

        <Button
          onClick={runDiff}
          disabled={running || !oldModelId || !newModelId || oldModelId === newModelId}
          className="gap-2 shrink-0"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {status || "对比中..."}
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              开始对比
            </>
          )}
        </Button>
      </div>

      {/* 3D Diff Viewer */}
      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center gap-4 border-b px-4 py-2.5 bg-muted/30">
          <span className="text-xs font-semibold">3D 差异视图</span>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_COLORS.added }} />
              新增
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_COLORS.removed }} />
              删除
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_COLORS.modified }} />
              修改
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_COLORS.unchanged }} />
              未变
            </span>
          </div>
        </div>
        <div
          ref={canvasRef}
          className="h-[400px] w-full bg-gradient-to-b from-slate-100 to-slate-200"
        />
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              icon={Plus}
              label="新增构件"
              value={result.summary.addedCount}
              color="text-green-500"
              bg="bg-green-500/10"
            />
            <SummaryCard
              icon={Minus}
              label="删除构件"
              value={result.summary.removedCount}
              color="text-red-500"
              bg="bg-red-500/10"
            />
            <SummaryCard
              icon={RefreshCw}
              label="修改构件"
              value={result.summary.modifiedCount}
              color="text-yellow-500"
              bg="bg-yellow-500/10"
            />
            <SummaryCard
              icon={Equal}
              label="未变构件"
              value={result.summary.unchangedCount}
              color="text-slate-500"
              bg="bg-slate-500/10"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Pie chart */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold">变更分布</h4>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData.filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData
                      .filter((d) => d.value > 0)
                      .map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Type bar chart */}
            {result.byType.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">按构件类型统计</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={result.byType.map((t) => ({
                      name: t.type.replace("IFC", ""),
                      新增: t.added,
                      删除: t.removed,
                      修改: t.modified,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="新增" fill={DIFF_COLORS.added} />
                    <Bar dataKey="删除" fill={DIFF_COLORS.removed} />
                    <Bar dataKey="修改" fill={DIFF_COLORS.modified} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Change List */}
          <div className="rounded-lg border">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <h4 className="text-sm font-semibold flex-1">变更详情</h4>
              <div className="flex gap-1">
                {(["all", "added", "removed", "modified"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      filter === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {f === "all"
                      ? `全部 (${(result.summary.addedCount + result.summary.removedCount + result.summary.modifiedCount)})`
                      : f === "added"
                        ? `新增 (${result.summary.addedCount})`
                        : f === "removed"
                          ? `删除 (${result.summary.removedCount})`
                          : `修改 (${result.summary.modifiedCount})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto divide-y">
              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  无匹配的变更项
                </p>
              ) : (
                filteredItems.map((item) => (
                  <DiffItemRow
                    key={`${item.status}-${item.element.globalId}`}
                    item={item}
                    expanded={expandedItems.has(item.element.globalId)}
                    onToggle={() =>
                      setExpandedItems((prev) => {
                        const next = new Set(prev)
                        if (next.has(item.element.globalId)) next.delete(item.element.globalId)
                        else next.add(item.element.globalId)
                        return next
                      })
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className="rounded-lg border p-4 flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function DiffItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: DiffItem
  expanded: boolean
  onToggle: () => void
}) {
  const statusConfig = {
    added: { icon: Plus, color: "text-green-500", bg: "bg-green-500/10", label: "新增" },
    removed: { icon: Minus, color: "text-red-500", bg: "bg-red-500/10", label: "删除" },
    modified: { icon: RefreshCw, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "修改" },
    unchanged: { icon: Equal, color: "text-slate-400", bg: "bg-slate-400/10", label: "未变" },
  }

  const cfg = statusConfig[item.status]
  const Icon = cfg.icon

  return (
    <div className="px-4 py-2.5">
      <button onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        {item.changes && item.changes.length > 0 ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <div className={`rounded p-1 ${cfg.bg}`}>
          <Icon className={`h-3 w-3 ${cfg.color}`} />
        </div>
        <span className="text-xs font-medium flex-1 truncate">
          {item.element.name}
        </span>
        <Badge variant="outline" className="text-[10px] h-4 shrink-0">
          {item.element.type.replace("IFC", "")}
        </Badge>
        <Badge
          className={`text-[10px] h-4 shrink-0 ${cfg.bg} ${cfg.color} border-0`}
        >
          {cfg.label}
        </Badge>
      </button>

      {expanded && item.changes && item.changes.length > 0 && (
        <div className="mt-2 ml-9 space-y-1">
          {item.changes.map((change, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="font-medium text-muted-foreground w-24 shrink-0 truncate">
                {change.property}
              </span>
              <span className="text-red-500 line-through">
                {change.oldValue ?? "—"}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-green-500 font-medium">
                {change.newValue ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
