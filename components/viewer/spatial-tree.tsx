"use client"

import { useState } from "react"
import type { SpatialNode } from "@/hooks/use-ifc-loader"
import { ChevronRight, ChevronDown, Building2, Layers, Box } from "lucide-react"
import { cn } from "@/lib/utils"

interface SpatialTreeProps {
  tree: SpatialNode | null
  onSelect: (expressID: number) => void
  selectedId?: number
}

function getNodeIcon(type: string) {
  if (type === "IFCBUILDING") return Building2
  if (type === "IFCBUILDINGSTOREY") return Layers
  return Box
}

function TreeNode({
  node,
  depth,
  onSelect,
  selectedId,
}: {
  node: SpatialNode
  depth: number
  onSelect: (expressID: number) => void
  selectedId?: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const Icon = getNodeIcon(node.type)
  const isSelected = node.expressID === selectedId

  const displayName = node.type
    ?.replace("IFC", "")
    .replace(/([A-Z])/g, " $1")
    .trim()

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors hover:bg-accent",
          isSelected && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => {
          if (node.expressID !== undefined) onSelect(node.expressID)
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {displayName || `Element #${node.expressID}`}
        </span>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child, i) => (
          <TreeNode
            key={`${child.expressID}-${i}`}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        ))}
    </div>
  )
}

export function SpatialTree({ tree, onSelect, selectedId }: SpatialTreeProps) {
  if (!tree) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Load a model to view its spatial structure
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto py-2">
      <TreeNode node={tree} depth={0} onSelect={onSelect} selectedId={selectedId} />
    </div>
  )
}
