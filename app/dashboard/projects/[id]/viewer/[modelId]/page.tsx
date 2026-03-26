"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { useParams } from "next/navigation"
import { useThreeScene } from "@/hooks/use-three-scene"
import { useIFCLoader } from "@/hooks/use-ifc-loader"
import { useModelContext } from "@/hooks/use-model-context"
import { useQuantityStats } from "@/hooks/use-quantity-stats"
import { useFPSMonitor } from "@/hooks/use-fps-monitor"
import { usePerfTracker } from "@/hooks/use-perf-tracker"
import { useRenderModes, type RenderMode, type HeatmapConfig } from "@/hooks/use-render-modes"
import { useElementEditor } from "@/hooks/use-element-editor"
import { ViewerToolbar } from "@/components/viewer/viewer-toolbar"
import { RenderModeSwitcher } from "@/components/viewer/render-mode-switcher"
import { PropertiesPanel } from "@/components/viewer/properties-panel"
import { ElementEditor } from "@/components/viewer/element-editor"
import { ExportToolbar } from "@/components/viewer/export-toolbar"
import { SpatialTree } from "@/components/viewer/spatial-tree"
import { ChatPanel, type ViewerCommand } from "@/components/chat/chat-panel"
import { StatisticsPanel } from "@/components/viewer/statistics-panel"
import { PerformancePanel } from "@/components/viewer/performance-panel"
import { CompliancePanel } from "@/components/viewer/compliance-panel"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  BarChart3,
  Activity,
  Shield,
  Pencil,
  X,
} from "lucide-react"
import * as THREE from "three"
import Link from "next/link"
import { cn } from "@/lib/utils"

export default function ViewerPage() {
  const params = useParams()
  const projectId = params.id as string
  const modelId = params.modelId as string

  const containerRef = useRef<HTMLDivElement>(null)
  const { fps, tick } = useFPSMonitor()
  const {
    metrics: perfMetrics,
    startModelLoad,
    endModelLoad,
    startAIRequest,
    endAIRequest,
    updateRendererStats,
    updateModelStats,
  } = usePerfTracker()
  const { ctxRef, frameModel, setPresetView, takeScreenshot, captureThumb } =
    useThreeScene(containerRef, tick)

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
    highlightByType,
    highlightElements,
    clearSelection,
    setWireframe,
    setXRay,
    setClipping,
    elementTypeMap,
    dispose,
    getIfcApi,
  } = useIFCLoader(ctxRef)

  // Render modes
  const {
    activeMode,
    initComposer,
    resizeComposer,
    applyMode,
    applyHeatmap,
    setSectionFill,
    renderWithComposer,
    hasComposer,
  } = useRenderModes()

  // Element editor
  const {
    editorState,
    saving,
    selectElement,
    clearEditorSelection,
    setTransformMode,
    changeProperty,
    deleteElement,
    toggleHideElement,
    duplicateElement,
    undoLast,
    exportGLTF,
    exportOBJ,
    exportIFC,
    saveToServer,
  } = useElementEditor(ctxRef, getIfcApi, modelRef, modelId)

  const [wireframe, setWireframeState] = useState(false)
  const [xray, setXRayState] = useState(false)
  const [clipping, setClippingState] = useState(false)
  const [clippingHeight, setClippingHeight] = useState(10)
  const [chatOpen, setChatOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [perfOpen, setPerfOpen] = useState(false)
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [modelName, setModelName] = useState("")
  const [loadError, setLoadError] = useState("")

  // Quantity statistics for Phase 4
  const quantityData = useQuantityStats(spatialTree, elementTypeMap, modelRef)

  // Build model context for AI
  const modelContext = useModelContext(
    modelName,
    spatialTree,
    modelStats,
    elementTypeMap
  )

  // Periodically update renderer stats
  useEffect(() => {
    const interval = setInterval(() => {
      if (ctxRef.current) {
        updateRendererStats(ctxRef.current.renderer)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [ctxRef, updateRendererStats])

  // Load model from server
  useEffect(() => {
    let cancelled = false

    async function fetchAndLoad() {
      try {
        const res = await fetch(`/api/models/${modelId}`)
        if (!res.ok) throw new Error("Model not found")
        const model = await res.json()
        setModelName(model.fileName)

        if (cancelled) return

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

        startModelLoad()
        const loaded = await loadModel(model.fileUrl)
        if (!cancelled) {
          endModelLoad(model.fileSize)
          frameModel(loaded)

          // Count vertices for perf stats
          let verts = 0
          loaded.traverse((child: any) => {
            if (child.isMesh && child.geometry) {
              const pos = child.geometry.getAttribute("position")
              if (pos) verts += pos.count
            }
          })
          updateModelStats(verts)

          // Capture thumbnail after rendering settles
          setTimeout(() => {
            if (cancelled) return
            const thumb = captureThumb()
            if (thumb) {
              fetch(`/api/models/${modelId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ thumbnail: thumb }),
              }).catch(() => {})
            }
          }, 2000)

          // Record view history
          fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modelId,
              action: "view",
              detail: `Viewed model: ${model.fileName}`,
            }),
          }).catch(() => {})
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load model"
          )
        }
      }
    }

    fetchAndLoad()

    return () => {
      cancelled = true
      dispose()
    }
  }, [modelId, ctxRef, loadModel, frameModel, dispose])

  // Initialize EffectComposer after model is loaded
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || loading || !modelRef.current) return
    if (hasComposer()) return

    const composer = initComposer(ctx)
    if (composer) {
      ctx.composerRender = () => composer.render()
    }
  }, [ctxRef, loading, modelRef, initComposer, hasComposer])

  // Resize composer on window resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const ctx = ctxRef.current
      if (!ctx) return
      resizeComposer(container.clientWidth, container.clientHeight, ctx.renderer.getPixelRatio())
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [ctxRef, resizeComposer])

  // Handle render mode change
  const handleModeChange = useCallback(
    (mode: RenderMode) => {
      const ctx = ctxRef.current
      if (!ctx) return
      applyMode(mode, ctx.scene)

      // Sync wireframe/xray states
      setWireframeState(mode === "wireframe")
      setXRayState(mode === "xray")
    },
    [ctxRef, applyMode]
  )

  // Handle heatmap attribute change
  const handleHeatmapChange = useCallback(
    (attribute: "area" | "cost" | "volume") => {
      const ctx = ctxRef.current
      if (!ctx || !elementTypeMap || !modelRef.current) return

      // Compute values per element
      const values = new Map<number, number>()
      let min = Infinity
      let max = -Infinity

      modelRef.current.traverse((child: any) => {
        if (child.isMesh && child.name.startsWith("ifc-")) {
          const eid = child.userData.expressID as number
          if (eid === undefined) return

          let val = 0
          if (attribute === "area" && child.geometry) {
            child.geometry.computeBoundingBox()
            const bbox = child.geometry.boundingBox
            if (bbox) {
              const s = bbox.getSize(new THREE.Vector3())
              val = 2 * (s.x * s.y + s.y * s.z + s.x * s.z)
            }
          } else if (attribute === "volume" && child.geometry) {
            child.geometry.computeBoundingBox()
            const bbox = child.geometry.boundingBox
            if (bbox) {
              const s = bbox.getSize(new THREE.Vector3())
              val = s.x * s.y * s.z
            }
          } else if (attribute === "cost") {
            // Use a simple cost model based on type
            const info = elementTypeMap?.get(eid)
            const type = info?.type?.toUpperCase() || ""
            if (type.includes("WALL")) val = 500
            else if (type.includes("SLAB")) val = 800
            else if (type.includes("BEAM") || type.includes("COLUMN")) val = 1200
            else if (type.includes("WINDOW")) val = 300
            else if (type.includes("DOOR")) val = 250
            else val = 100
          }

          values.set(eid, val)
          if (val < min) min = val
          if (val > max) max = val
        }
      })

      if (values.size > 0) {
        applyHeatmap(ctx.scene, { attribute, values, min, max })
      }
    },
    [ctxRef, elementTypeMap, modelRef, applyHeatmap]
  )

  // Click handler
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      pickElement(event.nativeEvent, container)
    },
    [pickElement]
  )

  // Sync editor with element selection
  useEffect(() => {
    if (selectedElement && editMode) {
      selectElement(selectedElement.expressID)
    }
  }, [selectedElement, editMode, selectElement])

  const handleToggleWireframe = useCallback(
    (force?: boolean) => {
      const next = force !== undefined ? force : !wireframe
      setWireframeState(next)
      setWireframe(next)
    },
    [wireframe, setWireframe]
  )

  const handleToggleXRay = useCallback(
    (force?: boolean) => {
      const next = force !== undefined ? force : !xray
      setXRayState(next)
      setXRay(next)
    },
    [xray, setXRay]
  )

  const handleToggleClipping = useCallback(
    (force?: boolean, height?: number) => {
      const next = force !== undefined ? force : !clipping
      setClippingState(next)
      if (height !== undefined) setClippingHeight(height)
      setClipping(next, height ?? clippingHeight)
    },
    [clipping, clippingHeight, setClipping]
  )

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

  // Handle AI commands
  const handleAICommand = useCallback(
    (command: ViewerCommand) => {
      switch (command.action) {
        case "highlightByType":
          highlightByType(command.params.type as string)
          break
        case "setView":
          setPresetView(
            command.params.view as "top" | "front" | "iso",
            modelRef.current
          )
          break
        case "toggleWireframe":
          handleToggleWireframe(command.params.enabled as boolean)
          break
        case "toggleXRay":
          handleToggleXRay(command.params.enabled as boolean)
          break
        case "toggleClipping":
          handleToggleClipping(
            command.params.enabled as boolean,
            command.params.height as number | undefined
          )
          break
        case "highlightElement":
          highlightByExpressId(command.params.expressID as number)
          break
        case "resetView":
          handleResetView()
          break
      }
    },
    [
      highlightByType,
      setPresetView,
      modelRef,
      handleToggleWireframe,
      handleToggleXRay,
      handleToggleClipping,
      highlightByExpressId,
      handleResetView,
    ]
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

        {/* Edit mode toggle */}
        <Button
          variant={editMode ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setEditMode(!editMode)
            if (editMode) {
              clearEditorSelection()
              setTransformMode(null)
            }
          }}
        >
          {editMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </Button>

        {/* Compliance toggle */}
        <Button
          variant={complianceOpen ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setComplianceOpen(!complianceOpen)
            if (!complianceOpen) { setChatOpen(false); setStatsOpen(false); setPerfOpen(false) }
          }}
        >
          {complianceOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
        </Button>

        {/* Performance toggle */}
        <Button
          variant={perfOpen ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setPerfOpen(!perfOpen)
            if (!perfOpen) { setChatOpen(false); setStatsOpen(false); setComplianceOpen(false) }
          }}
        >
          {perfOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
        </Button>

        {/* Statistics toggle */}
        <Button
          variant={statsOpen ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setStatsOpen(!statsOpen)
            if (!statsOpen) { setChatOpen(false); setPerfOpen(false); setComplianceOpen(false) }
          }}
        >
          {statsOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <BarChart3 className="h-4 w-4" />
          )}
        </Button>

        {/* AI Chat toggle */}
        <Button
          variant={chatOpen ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setChatOpen(!chatOpen)
            if (!chatOpen) { setStatsOpen(false); setPerfOpen(false); setComplianceOpen(false) }
          }}
        >
          {chatOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Spatial Tree (fixed) */}
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
              <Link
                href={`/dashboard/projects/${projectId}`}
                className="mt-4"
              >
                <Button variant="outline" size="sm">
                  Back to project
                </Button>
              </Link>
            </div>
          )}

          {/* Render Mode Switcher */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <RenderModeSwitcher
              activeMode={activeMode}
              onModeChange={handleModeChange}
              onHeatmapChange={handleHeatmapChange}
              heatmapAttribute={activeMode === "heatmap" ? "area" : undefined}
            />
            {editMode && (
              <ExportToolbar
                onExportGLTF={exportGLTF}
                onExportOBJ={exportOBJ}
                onExportIFC={exportIFC}
                onSave={saveToServer}
                modificationCount={editorState.modifications.length}
                saving={saving}
              />
            )}
          </div>

          {/* Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <ViewerToolbar
              wireframe={wireframe}
              xray={xray}
              clipping={clipping}
              clippingHeight={clippingHeight}
              onToggleWireframe={() => handleToggleWireframe()}
              onToggleXRay={() => handleToggleXRay()}
              onToggleClipping={() => {
                handleToggleClipping()
                setSectionFill(!clipping, clippingHeight)
              }}
              onClippingHeightChange={(h) => {
                handleClippingHeightChange(h)
                setSectionFill(true, h)
              }}
              onPresetView={(view) => setPresetView(view, modelRef.current)}
              onScreenshot={takeScreenshot}
              onResetView={handleResetView}
            />
          </div>

          {/* Compliance Panel (overlay on viewport) */}
          {complianceOpen && (
            <div className="absolute right-0 top-0 z-20 h-full w-96 border-l bg-background/95 shadow-lg backdrop-blur-sm">
              <CompliancePanel
                getIfcApi={getIfcApi}
                elementTypeMap={elementTypeMap}
                onHighlightElements={highlightElements}
                onHighlightElement={highlightByExpressId}
                onAIGenerateRule={async (prompt) => {
                  try {
                    const res = await fetch("/api/compliance", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ prompt }),
                    })
                    if (!res.ok) throw new Error("Failed")
                    const { rules } = await res.json()
                    if (rules?.length > 0) {
                      // Dispatch event to add rules to the panel
                      window.dispatchEvent(
                        new CustomEvent("compliance-add-rules", { detail: { rules } })
                      )
                    }
                  } catch (err) {
                    console.error("AI rule generation failed:", err)
                  }
                }}
              />
            </div>
          )}

          {/* Performance Panel (overlay on viewport) */}
          {perfOpen && (
            <div className="absolute right-0 top-0 z-20 h-full w-80 border-l bg-background/95 shadow-lg backdrop-blur-sm">
              <PerformancePanel fps={fps} metrics={perfMetrics} />
            </div>
          )}

          {/* Statistics Panel (overlay on viewport) */}
          {statsOpen && (
            <div className="absolute right-0 top-0 z-20 h-full w-96 border-l bg-background/95 shadow-lg backdrop-blur-sm">
              <StatisticsPanel
                data={quantityData}
                onRequestAIInsight={(summary) => {
                  setStatsOpen(false)
                  setChatOpen(true)
                  // Delay to let chat panel mount, then trigger message
                  setTimeout(() => {
                    const event = new CustomEvent("ai-insight-request", {
                      detail: { message: summary },
                    })
                    window.dispatchEvent(event)
                  }, 300)
                }}
              />
            </div>
          )}

          {/* AI Chat Panel (overlay on viewport) */}
          {chatOpen && (
            <div className="absolute right-0 top-0 z-20 h-full w-96 border-l bg-background/95 shadow-lg backdrop-blur-sm">
              <ChatPanel
                modelId={modelId}
                modelContext={modelContext}
                onCommand={handleAICommand}
                onAIStart={startAIRequest}
                onAIEnd={endAIRequest}
              />
            </div>
          )}
        </div>

        {/* Right panel - Properties or Editor (fixed) */}
        <div className="w-72 shrink-0 border-l bg-background">
          {editMode ? (
            <ElementEditor
              selectedElement={selectedElement}
              properties={editorState.properties}
              transformMode={editorState.transformMode}
              onTransformModeChange={setTransformMode}
              onPropertyChange={(key, value) => {
                if (selectedElement) changeProperty(selectedElement.expressID, key, value)
              }}
              onDeleteElement={() => {
                if (selectedElement) {
                  deleteElement(selectedElement.expressID)
                  clearSelection()
                  clearEditorSelection()
                }
              }}
              onHideElement={() => {
                if (selectedElement) toggleHideElement(selectedElement.expressID)
              }}
              onDuplicateElement={() => {
                if (selectedElement) duplicateElement(selectedElement.expressID)
              }}
              onUndoLast={undoLast}
              hiddenElements={editorState.hiddenElements}
              modifications={editorState.modifications}
              onClearSelection={() => {
                clearSelection()
                clearEditorSelection()
              }}
            />
          ) : (
            <PropertiesPanel
              selectedElement={selectedElement}
              modelStats={modelStats}
              modelId={modelId}
              onClearSelection={clearSelection}
            />
          )}
        </div>
      </div>
    </div>
  )
}
