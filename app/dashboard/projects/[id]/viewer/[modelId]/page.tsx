"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useThreeScene } from "@/hooks/use-three-scene"
import { useIFCLoader } from "@/hooks/use-ifc-loader"
import { ViewerToolbar } from "@/components/viewer/viewer-toolbar"
import { PropertiesPanel } from "@/components/viewer/properties-panel"
import { SpatialTree } from "@/components/viewer/spatial-tree"
import { Button } from "@/components/ui/button"
import { ArrowLeft, PanelLeftOpen, PanelRightOpen, Loader2 } from "lucide-react"
import Link from "next/link"

export default function ViewerPage() {
  const params = useParams()
  const projectId = params.id as string
  const modelId = params.modelId as string

  const containerRef = useRef<HTMLDivElement>(null)
  const { ctxRef, frameModel, setPresetView, takeScreenshot } = useThreeScene(containerRef)

  const {
    modelRef,
    loading,
    progress,
    selectedElement,
    spatialTree,
    modelStats,
    loadModel,
    pickElement,
    highlightByExpressId,
    clearSelection,
    setWireframe,
    setXRay,
    setClipping,
    dispose,
  } = useIFCLoader(ctxRef)

  const [wireframe, setWireframeState] = useState(false)
  const [xray, setXRayState] = useState(false)
  const [clipping, setClippingState] = useState(false)
  const [clippingHeight, setClippingHeight] = useState(10)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [modelName, setModelName] = useState("")
  const [loadError, setLoadError] = useState("")

  // Load model from server
  useEffect(() => {
    let cancelled = false

    async function fetchAndLoad() {
      try {
        // Get model info
        const res = await fetch(`/api/models/${modelId}`)
        if (!res.ok) throw new Error("Model not found")
        const model = await res.json()
        setModelName(model.fileName)

        if (cancelled) return

        // Wait for scene to be ready
        const waitForScene = () =>
          new Promise<void>((resolve) => {
            const check = () => {
              if (ctxRef.current) resolve()
              else setTimeout(check, 100)
            }
            check()
          })
        await waitForScene()

        if (cancelled) return

        // Load the IFC model
        const loaded = await loadModel(model.fileUrl)
        if (!cancelled) {
          frameModel(loaded)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load model")
        }
      }
    }

    fetchAndLoad()

    return () => {
      cancelled = true
      dispose()
    }
  }, [modelId, ctxRef, loadModel, frameModel, dispose])

  // Click handler
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      pickElement(event.nativeEvent, container)
    },
    [pickElement]
  )

  const handleToggleWireframe = useCallback(() => {
    const next = !wireframe
    setWireframeState(next)
    setWireframe(next)
  }, [wireframe, setWireframe])

  const handleToggleXRay = useCallback(() => {
    const next = !xray
    setXRayState(next)
    setXRay(next)
  }, [xray, setXRay])

  const handleToggleClipping = useCallback(() => {
    const next = !clipping
    setClippingState(next)
    setClipping(next, clippingHeight)
  }, [clipping, clippingHeight, setClipping])

  const handleClippingHeightChange = useCallback(
    (height: number) => {
      setClippingHeight(height)
      setClipping(true, height)
    },
    [setClipping]
  )

  const handleResetView = useCallback(() => {
    if (modelRef.current) {
      frameModel(modelRef.current)
    }
  }, [modelRef, frameModel])

  const handleTreeSelect = useCallback(
    (expressID: number) => {
      highlightByExpressId(expressID)
    },
    [highlightByExpressId]
  )

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Link href={`/dashboard/projects/${projectId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm font-medium truncate">
          {modelName || "Loading..."}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Spatial Tree */}
        {leftPanelOpen && (
          <div className="w-64 shrink-0 border-r bg-background">
            <div className="border-b p-3">
              <h3 className="text-sm font-semibold">Structure</h3>
            </div>
            <SpatialTree
              tree={spatialTree}
              onSelect={handleTreeSelect}
              selectedId={selectedElement?.expressID}
            />
          </div>
        )}

        {/* 3D Viewport */}
        <div className="relative flex-1">
          <div
            ref={containerRef}
            className="h-full w-full bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800"
            onClick={handleCanvasClick}
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Loading model...</p>
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}

          {/* Error overlay */}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80">
              <p className="text-sm text-destructive">{loadError}</p>
              <Link href={`/dashboard/projects/${projectId}`} className="mt-4">
                <Button variant="outline" size="sm">
                  Back to project
                </Button>
              </Link>
            </div>
          )}

          {/* Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <ViewerToolbar
              wireframe={wireframe}
              xray={xray}
              clipping={clipping}
              clippingHeight={clippingHeight}
              onToggleWireframe={handleToggleWireframe}
              onToggleXRay={handleToggleXRay}
              onToggleClipping={handleToggleClipping}
              onClippingHeightChange={handleClippingHeightChange}
              onPresetView={(view) => setPresetView(view, modelRef.current)}
              onScreenshot={takeScreenshot}
              onResetView={handleResetView}
            />
          </div>
        </div>

        {/* Right panel - Properties */}
        {rightPanelOpen && (
          <PropertiesPanel
            selectedElement={selectedElement}
            modelStats={modelStats}
            onClearSelection={clearSelection}
          />
        )}
      </div>
    </div>
  )
}
