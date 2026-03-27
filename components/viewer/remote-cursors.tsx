"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import type { ThreeSceneContext } from "@/hooks/use-three-scene"

interface RemoteCursorData {
  id: string
  name: string
  color: string
  cursor: {
    x: number
    y: number
    worldX?: number
    worldY?: number
    worldZ?: number
  }
}

/**
 * Renders remote user cursors as HTML overlays on the 3D viewport.
 */
export function RemoteCursorsOverlay({
  remoteCursors,
  containerRef,
}: {
  remoteCursors: RemoteCursorData[]
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  if (remoteCursors.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {remoteCursors.map((cursor) => {
        const container = containerRef.current
        if (!container) return null

        const x = cursor.cursor.x * container.clientWidth
        const y = cursor.cursor.y * container.clientHeight

        return (
          <div
            key={cursor.id}
            className="absolute transition-all duration-75 ease-out"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: "translate(-2px, -2px)",
            }}
          >
            {/* Cursor arrow SVG */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            >
              <path
                d="M3 2L17 10L10 11.5L7 18L3 2Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            {/* User name label */}
            <div
              className="ml-4 -mt-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Renders remote selections as colored highlights in the 3D scene.
 */
export function useRemoteSelections(
  ctxRef: React.RefObject<ThreeSceneContext | null>,
  remoteSelections: Map<string, number | null>,
  onlineUsers: { id: string; color: string }[],
  expressIdToMeshGetter: () => Map<number, THREE.Mesh> | null
) {
  const highlightGroupRef = useRef<THREE.Group | null>(null)

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return

    // Remove previous highlights
    if (highlightGroupRef.current) {
      ctx.scene.remove(highlightGroupRef.current)
      highlightGroupRef.current = null
    }

    const expressIdToMesh = expressIdToMeshGetter()
    if (!expressIdToMesh) return

    const group = new THREE.Group()
    group.name = "remote-selections"

    remoteSelections.forEach((expressID, uid) => {
      if (expressID === null) return
      const mesh = expressIdToMesh.get(expressID)
      if (!mesh) return

      const user = onlineUsers.find((u) => u.id === uid)
      const color = user?.color || "#FF9800"

      const mat = new THREE.MeshLambertMaterial({
        transparent: true,
        opacity: 0.4,
        color: new THREE.Color(color),
        depthTest: false,
      })

      const clone = new THREE.Mesh(mesh.geometry, mat)
      clone.position.copy(mesh.position)
      clone.rotation.copy(mesh.rotation)
      clone.scale.copy(mesh.scale)
      clone.matrix.copy(mesh.matrix)
      clone.matrixAutoUpdate = false
      clone.renderOrder = 2
      group.add(clone)
    })

    if (group.children.length > 0) {
      ctx.scene.add(group)
      highlightGroupRef.current = group
    }

    return () => {
      if (highlightGroupRef.current && ctx) {
        ctx.scene.remove(highlightGroupRef.current)
        highlightGroupRef.current = null
      }
    }
  }, [ctxRef, remoteSelections, onlineUsers, expressIdToMeshGetter])
}
