"use client"

import { useMemo } from "react"
import type { SpatialNode } from "./use-ifc-loader"
import * as THREE from "three"

export interface ElementTypeStats {
  type: string
  count: number
  percentage: number
}

export interface FloorStats {
  name: string
  expressID: number
  elementCount: number
  types: Record<string, number>
}

export interface QuantityData {
  totalElements: number
  totalFloors: number
  elementsByType: ElementTypeStats[]
  floorStats: FloorStats[]
  geometryStats: {
    totalVertices: number
    totalFaces: number
    boundingBox: { min: THREE.Vector3; max: THREE.Vector3 } | null
    estimatedVolume: number
    estimatedArea: number
  }
  typeDistribution: { name: string; value: number }[]
  floorDistribution: { name: string; elements: number }[]
}

export function useQuantityStats(
  spatialTree: SpatialNode | null,
  elementTypeMap: Map<number, { type: string; name?: string }> | null,
  modelRef: React.RefObject<THREE.Object3D | null>
): QuantityData | null {
  return useMemo(() => {
    if (!spatialTree || !elementTypeMap) return null

    // 1. Count elements by type
    const typeCounts = new Map<string, number>()
    elementTypeMap.forEach((info) => {
      const t = info.type
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1)
    })

    const totalElements = elementTypeMap.size
    const elementsByType: ElementTypeStats[] = Array.from(typeCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / totalElements) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)

    // 2. Analyze floor structure
    const floorStats: FloorStats[] = []
    let totalFloors = 0

    function traverseForFloors(node: SpatialNode) {
      if (node.type === "IFCBUILDINGSTOREY") {
        totalFloors++
        const types: Record<string, number> = {}
        let elementCount = 0

        function countChildren(n: SpatialNode) {
          if (n.expressID !== node.expressID) {
            elementCount++
            const info = elementTypeMap!.get(n.expressID)
            if (info) {
              types[info.type] = (types[info.type] || 0) + 1
            }
          }
          n.children?.forEach(countChildren)
        }
        countChildren(node)

        floorStats.push({
          name: `Floor ${totalFloors}`,
          expressID: node.expressID,
          elementCount,
          types,
        })
      }
      node.children?.forEach(traverseForFloors)
    }
    traverseForFloors(spatialTree)

    // 3. Geometry statistics from Three.js model
    let totalVertices = 0
    let totalFaces = 0
    let boundingBox: { min: THREE.Vector3; max: THREE.Vector3 } | null = null
    let estimatedArea = 0

    const model = modelRef.current
    if (model) {
      const box = new THREE.Box3().setFromObject(model)
      boundingBox = { min: box.min, max: box.max }

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          const geo = mesh.geometry
          if (geo) {
            const posAttr = geo.getAttribute("position")
            if (posAttr) totalVertices += posAttr.count
            if (geo.index) {
              totalFaces += geo.index.count / 3
            } else if (posAttr) {
              totalFaces += posAttr.count / 3
            }

            // Estimate surface area from triangles
            if (posAttr && geo.index) {
              const pos = posAttr
              const idx = geo.index
              for (let i = 0; i < idx.count; i += 3) {
                const a = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i))
                const b = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i + 1))
                const c = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i + 2))

                // Apply mesh world matrix
                a.applyMatrix4(mesh.matrixWorld)
                b.applyMatrix4(mesh.matrixWorld)
                c.applyMatrix4(mesh.matrixWorld)

                const ab = new THREE.Vector3().subVectors(b, a)
                const ac = new THREE.Vector3().subVectors(c, a)
                estimatedArea += ab.cross(ac).length() * 0.5
              }
            }
          }
        }
      })
    }

    const size = boundingBox
      ? new THREE.Vector3().subVectors(boundingBox.max, boundingBox.min)
      : null
    const estimatedVolume = size ? size.x * size.y * size.z : 0

    // 4. Distribution data for charts
    const typeDistribution = elementsByType.slice(0, 10).map((e) => ({
      name: e.type.replace("IFC", ""),
      value: e.count,
    }))

    const floorDistribution = floorStats.map((f) => ({
      name: f.name,
      elements: f.elementCount,
    }))

    return {
      totalElements,
      totalFloors,
      elementsByType,
      floorStats,
      geometryStats: {
        totalVertices,
        totalFaces,
        boundingBox,
        estimatedVolume: Math.round(estimatedVolume * 100) / 100,
        estimatedArea: Math.round(estimatedArea * 100) / 100,
      },
      typeDistribution,
      floorDistribution,
    }
  }, [spatialTree, elementTypeMap, modelRef])
}
