/**
 * IFC Model Diff Engine
 *
 * Compares two IFC models by matching elements via GlobalId.
 * Detects: added, removed, modified elements with property diffs.
 */

export interface DiffElement {
  expressID: number         // expressID in the respective model
  globalId: string
  type: string
  name: string
}

export interface PropertyChange {
  property: string
  oldValue: string | number | null
  newValue: string | number | null
}

export interface DiffItem {
  status: "added" | "removed" | "modified" | "unchanged"
  element: DiffElement
  /** For modified elements, the expressID in the other model */
  otherExpressID?: number
  changes?: PropertyChange[]
}

export interface DiffResult {
  added: DiffItem[]
  removed: DiffItem[]
  modified: DiffItem[]
  unchanged: DiffItem[]
  summary: {
    totalOld: number
    totalNew: number
    addedCount: number
    removedCount: number
    modifiedCount: number
    unchangedCount: number
  }
  byType: { type: string; added: number; removed: number; modified: number }[]
  byFloor: { floor: string; added: number; removed: number; modified: number }[]
}

/** Extract element info from an IFC model */
export function extractElements(
  ifcApi: any,
  modelID: number
): Map<string, { expressID: number; globalId: string; type: string; name: string; props: Record<string, any> }> {
  const elements = new Map<string, any>()

  // Get all mesh IDs by streaming
  const allIds: number[] = []
  ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
    allIds.push(flatMesh.expressID)
  })

  for (const eid of allIds) {
    try {
      const line = ifcApi.GetLine(modelID, eid, false)
      if (!line) continue

      const globalId = line.GlobalId?.value
      if (!globalId) continue

      const typeName = ifcApi.GetNameFromTypeCode(line.type) || "Unknown"
      const name = line.Name?.value || line.LongName?.value || `Element #${eid}`

      // Extract key properties for comparison
      const props: Record<string, any> = {}
      const propKeys = ["Name", "Description", "ObjectType", "Tag",
        "OverallHeight", "OverallWidth", "OverallDepth",
        "Height", "Width", "Depth"]

      for (const key of propKeys) {
        if (line[key]?.value !== undefined) {
          props[key] = line[key].value
        }
      }

      elements.set(globalId, {
        expressID: eid,
        globalId,
        type: typeName.toUpperCase(),
        name,
        props,
      })
    } catch {
      // skip elements that can't be read
    }
  }

  return elements
}

/** Compare two sets of elements */
export function compareModels(
  oldElements: Map<string, any>,
  newElements: Map<string, any>,
  oldFloorMap?: Map<number, string>,
  newFloorMap?: Map<number, string>
): DiffResult {
  const added: DiffItem[] = []
  const removed: DiffItem[] = []
  const modified: DiffItem[] = []
  const unchanged: DiffItem[] = []

  // Check old elements: removed or modified
  oldElements.forEach((oldEl, globalId) => {
    const newEl = newElements.get(globalId)
    if (!newEl) {
      removed.push({
        status: "removed",
        element: {
          expressID: oldEl.expressID,
          globalId: oldEl.globalId,
          type: oldEl.type,
          name: oldEl.name,
        },
      })
    } else {
      // Compare properties
      const changes = compareProperties(oldEl.props, newEl.props)
      if (changes.length > 0) {
        modified.push({
          status: "modified",
          element: {
            expressID: oldEl.expressID,
            globalId: oldEl.globalId,
            type: oldEl.type,
            name: oldEl.name,
          },
          otherExpressID: newEl.expressID,
          changes,
        })
      } else {
        unchanged.push({
          status: "unchanged",
          element: {
            expressID: oldEl.expressID,
            globalId: oldEl.globalId,
            type: oldEl.type,
            name: oldEl.name,
          },
          otherExpressID: newEl.expressID,
        })
      }
    }
  })

  // Check new elements: added
  newElements.forEach((newEl, globalId) => {
    if (!oldElements.has(globalId)) {
      added.push({
        status: "added",
        element: {
          expressID: newEl.expressID,
          globalId: newEl.globalId,
          type: newEl.type,
          name: newEl.name,
        },
      })
    }
  })

  // Build type summary
  const typeMap = new Map<string, { added: number; removed: number; modified: number }>()
  for (const item of added) {
    const t = item.element.type
    const entry = typeMap.get(t) || { added: 0, removed: 0, modified: 0 }
    entry.added++
    typeMap.set(t, entry)
  }
  for (const item of removed) {
    const t = item.element.type
    const entry = typeMap.get(t) || { added: 0, removed: 0, modified: 0 }
    entry.removed++
    typeMap.set(t, entry)
  }
  for (const item of modified) {
    const t = item.element.type
    const entry = typeMap.get(t) || { added: 0, removed: 0, modified: 0 }
    entry.modified++
    typeMap.set(t, entry)
  }

  const byType = Array.from(typeMap.entries()).map(([type, counts]) => ({
    type,
    ...counts,
  }))

  // Build floor summary (if floor maps provided)
  const floorMap = new Map<string, { added: number; removed: number; modified: number }>()
  if (oldFloorMap && newFloorMap) {
    for (const item of removed) {
      const floor = oldFloorMap.get(item.element.expressID) || "Unknown"
      const entry = floorMap.get(floor) || { added: 0, removed: 0, modified: 0 }
      entry.removed++
      floorMap.set(floor, entry)
    }
    for (const item of added) {
      const floor = newFloorMap.get(item.element.expressID) || "Unknown"
      const entry = floorMap.get(floor) || { added: 0, removed: 0, modified: 0 }
      entry.added++
      floorMap.set(floor, entry)
    }
    for (const item of modified) {
      const floor = oldFloorMap.get(item.element.expressID) || "Unknown"
      const entry = floorMap.get(floor) || { added: 0, removed: 0, modified: 0 }
      entry.modified++
      floorMap.set(floor, entry)
    }
  }

  const byFloor = Array.from(floorMap.entries()).map(([floor, counts]) => ({
    floor,
    ...counts,
  }))

  return {
    added,
    removed,
    modified,
    unchanged,
    summary: {
      totalOld: oldElements.size,
      totalNew: newElements.size,
      addedCount: added.length,
      removedCount: removed.length,
      modifiedCount: modified.length,
      unchangedCount: unchanged.length,
    },
    byType,
    byFloor,
  }
}

function compareProperties(
  oldProps: Record<string, any>,
  newProps: Record<string, any>
): PropertyChange[] {
  const changes: PropertyChange[] = []
  const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)])

  for (const key of allKeys) {
    const oldVal = oldProps[key] ?? null
    const newVal = newProps[key] ?? null

    if (oldVal !== newVal) {
      // For numbers, use tolerance
      if (typeof oldVal === "number" && typeof newVal === "number") {
        if (Math.abs(oldVal - newVal) > 0.001) {
          changes.push({ property: key, oldValue: oldVal, newValue: newVal })
        }
      } else {
        changes.push({
          property: key,
          oldValue: oldVal,
          newValue: newVal,
        })
      }
    }
  }

  return changes
}
