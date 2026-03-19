"use client"

import { useRef, useCallback, useState } from "react"
import type * as THREE from "three"

export interface PerfMetrics {
  modelLoadTime: number | null       // ms
  modelFileSize: number | null       // bytes
  aiResponseLatency: number | null   // ms (last)
  aiAvgLatency: number | null        // ms (average)
  memoryUsage: number | null         // MB
  drawCalls: number | null
  triangles: number | null
  textureMemory: number | null       // MB
  geometryMemory: number | null      // MB
  modelVertices: number | null
}

export function usePerfTracker() {
  const [metrics, setMetrics] = useState<PerfMetrics>({
    modelLoadTime: null,
    modelFileSize: null,
    aiResponseLatency: null,
    aiAvgLatency: null,
    memoryUsage: null,
    drawCalls: null,
    triangles: null,
    textureMemory: null,
    geometryMemory: null,
    modelVertices: null,
  })

  const loadStartRef = useRef<number>(0)
  const aiLatenciesRef = useRef<number[]>([])
  const aiStartRef = useRef<number>(0)

  const startModelLoad = useCallback(() => {
    loadStartRef.current = performance.now()
  }, [])

  const endModelLoad = useCallback((fileSize?: number) => {
    const elapsed = Math.round(performance.now() - loadStartRef.current)
    setMetrics((prev) => ({
      ...prev,
      modelLoadTime: elapsed,
      modelFileSize: fileSize ?? prev.modelFileSize,
    }))
  }, [])

  const startAIRequest = useCallback(() => {
    aiStartRef.current = performance.now()
  }, [])

  const endAIRequest = useCallback(() => {
    const latency = Math.round(performance.now() - aiStartRef.current)
    aiLatenciesRef.current.push(latency)
    if (aiLatenciesRef.current.length > 50) aiLatenciesRef.current.shift()
    const avg = Math.round(
      aiLatenciesRef.current.reduce((a, b) => a + b, 0) /
        aiLatenciesRef.current.length
    )
    setMetrics((prev) => ({
      ...prev,
      aiResponseLatency: latency,
      aiAvgLatency: avg,
    }))
  }, [])

  // Call periodically to update renderer stats
  const updateRendererStats = useCallback(
    (renderer: THREE.WebGLRenderer | null) => {
      if (!renderer) return

      const info = renderer.info
      setMetrics((prev) => ({
        ...prev,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textureMemory: Math.round((info.memory.textures * 4) / 1024 / 1024 * 100) / 100,
        geometryMemory: Math.round((info.memory.geometries * 0.5) / 1024 * 100) / 100,
      }))

      // Browser memory API (if available)
      const perfMemory = (performance as any).memory
      if (perfMemory) {
        setMetrics((prev) => ({
          ...prev,
          memoryUsage: Math.round(perfMemory.usedJSHeapSize / 1024 / 1024),
        }))
      }
    },
    []
  )

  const updateModelStats = useCallback((vertices: number) => {
    setMetrics((prev) => ({ ...prev, modelVertices: vertices }))
  }, [])

  return {
    metrics,
    startModelLoad,
    endModelLoad,
    startAIRequest,
    endAIRequest,
    updateRendererStats,
    updateModelStats,
  }
}
