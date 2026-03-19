"use client"

import type { IFCElementInfo, ModelStats } from "@/hooks/use-ifc-loader"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Box, Layers, Hash, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PropertiesPanelProps {
  selectedElement: IFCElementInfo | null
  modelStats: ModelStats | null
  onClearSelection: () => void
}

export function PropertiesPanel({
  selectedElement,
  modelStats,
  onClearSelection,
}: PropertiesPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h3 className="font-semibold">Properties</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Model stats */}
        {modelStats && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Model Info
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3 text-center">
                <Box className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-lg font-bold">{modelStats.elementCount}</p>
                <p className="text-xs text-muted-foreground">Elements</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Layers className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-lg font-bold">{modelStats.levelCount}</p>
                <p className="text-xs text-muted-foreground">Floors</p>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Selected element */}
        {selectedElement ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Selected Element
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClearSelection}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Name</span>
              </div>
              <p className="text-sm font-medium">{selectedElement.name}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Box className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Type</span>
              </div>
              <Badge variant="secondary">{selectedElement.type}</Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Express ID</span>
              </div>
              <p className="text-sm font-mono">{selectedElement.expressID}</p>
            </div>

            {selectedElement.globalId && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Global ID</span>
                </div>
                <p className="text-sm font-mono break-all">
                  {selectedElement.globalId}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Box className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Click on a model element to view its properties
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
