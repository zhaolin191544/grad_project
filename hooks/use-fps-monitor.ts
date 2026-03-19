"use client"

import { useRef, useCallback, useState } from "react"

export interface FPSData {
  current: number
  avg: number
  min: number
  max: number
  history: number[] // last 60 samples for chart
}

export function useFPSMonitor() {
  const [fps, setFps] = useState<FPSData>({
    current: 0,
    avg: 0,
    min: Infinity,
    max: 0,
    history: [],
  })

  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const historyRef = useRef<number[]>([])
  const allFpsRef = useRef<number[]>([])

  // Call this every animation frame
  const tick = useCallback(() => {
    frameCountRef.current++
    const now = performance.now()
    const elapsed = now - lastTimeRef.current

    // Update every 500ms
    if (elapsed >= 500) {
      const currentFps = Math.round((frameCountRef.current / elapsed) * 1000)
      frameCountRef.current = 0
      lastTimeRef.current = now

      allFpsRef.current.push(currentFps)
      // Keep last 120 samples for avg calculation
      if (allFpsRef.current.length > 120) allFpsRef.current.shift()

      historyRef.current.push(currentFps)
      // Keep last 60 for chart
      if (historyRef.current.length > 60) historyRef.current.shift()

      const avg = Math.round(
        allFpsRef.current.reduce((a, b) => a + b, 0) / allFpsRef.current.length
      )
      const min = Math.min(...allFpsRef.current)
      const max = Math.max(...allFpsRef.current)

      setFps({
        current: currentFps,
        avg,
        min,
        max,
        history: [...historyRef.current],
      })
    }
  }, [])

  const reset = useCallback(() => {
    frameCountRef.current = 0
    lastTimeRef.current = performance.now()
    historyRef.current = []
    allFpsRef.current = []
    setFps({ current: 0, avg: 0, min: Infinity, max: 0, history: [] })
  }, [])

  return { fps, tick, reset }
}
