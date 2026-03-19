"use client"

import { useMemo } from "react"
import type { SpatialNode, ModelStats } from "./use-ifc-loader"
import type { ModelContext } from "@/components/chat/chat-panel"

/**
 * Extracts structured context from the IFC model for AI prompts.
 * Summarizes the spatial tree and element types without sending the full raw data.
 */
export function useModelContext(
  fileName: string,
  spatialTree: SpatialNode | null,
  modelStats: ModelStats | null,
  elementMap: Map<number, { type: string; name?: string }> | null
): ModelContext | null {
  return useMemo(() => {
    if (!spatialTree && !modelStats) return null

    // Build element summary by type
    const elementSummary: Record<string, number> = {}
    const elementList: { expressID: number; type: string; name: string }[] = []

    if (elementMap) {
      elementMap.forEach((info, expressID) => {
        const type = info.type || "Unknown"
        elementSummary[type] = (elementSummary[type] || 0) + 1
        elementList.push({
          expressID,
          type,
          name: info.name || "Unnamed",
        })
      })
    } else if (spatialTree) {
      // Extract from spatial tree if no element map
      extractElementsFromTree(spatialTree, elementSummary, elementList)
    }

    return {
      fileName,
      stats: modelStats,
      spatialTree: spatialTree ? simplifyTree(spatialTree) : null,
      elementSummary,
      elementList,
    }
  }, [fileName, spatialTree, modelStats, elementMap])
}

function extractElementsFromTree(
  node: SpatialNode,
  summary: Record<string, number>,
  list: { expressID: number; type: string; name: string }[]
) {
  if (node.type && node.expressID !== undefined) {
    summary[node.type] = (summary[node.type] || 0) + 1
    list.push({
      expressID: node.expressID,
      type: node.type,
      name: "Element",
    })
  }
  node.children?.forEach((child) =>
    extractElementsFromTree(child, summary, list)
  )
}

function simplifyTree(node: SpatialNode, depth = 0): unknown {
  // Limit depth to avoid huge context
  if (depth > 4) {
    return {
      type: node.type,
      expressID: node.expressID,
      childCount: node.children?.length || 0,
    }
  }

  return {
    type: node.type,
    expressID: node.expressID,
    children: node.children?.map((c) => simplifyTree(c, depth + 1)),
  }
}
