"use client"

import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ArrowUp,
  ArrowRight,
  Box,
  Grid3x3,
  Eye,
  Scissors,
  Camera,
  RotateCcw,
  Minus,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ViewerToolbarProps {
  wireframe: boolean
  xray: boolean
  clipping: boolean
  clippingHeight: number
  onToggleWireframe: () => void
  onToggleXRay: () => void
  onToggleClipping: () => void
  onClippingHeightChange: (height: number) => void
  onPresetView: (view: "top" | "front" | "iso") => void
  onScreenshot: () => void
  onResetView: () => void
}

function ToolbarButton({
  active,
  tooltip,
  onClick,
  children,
  small,
}: {
  active?: boolean
  tooltip: string
  onClick: () => void
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
              small ? "h-6 w-6" : "h-8 w-8",
              active && "bg-secondary text-secondary-foreground"
            )}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function ViewerToolbar({
  wireframe,
  xray,
  clipping,
  clippingHeight,
  onToggleWireframe,
  onToggleXRay,
  onToggleClipping,
  onClippingHeightChange,
  onPresetView,
  onScreenshot,
  onResetView,
}: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
      {/* Preset views */}
      <ToolbarButton tooltip="Top View" onClick={() => onPresetView("top")}>
        <ArrowUp className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton tooltip="Front View" onClick={() => onPresetView("front")}>
        <ArrowRight className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton tooltip="Isometric View" onClick={() => onPresetView("iso")}>
        <Box className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Display modes */}
      <ToolbarButton tooltip="Wireframe" active={wireframe} onClick={onToggleWireframe}>
        <Grid3x3 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton tooltip="X-Ray" active={xray} onClick={onToggleXRay}>
        <Eye className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton tooltip="Section Plane" active={clipping} onClick={onToggleClipping}>
        <Scissors className="h-4 w-4" />
      </ToolbarButton>

      {clipping && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <div className="flex items-center gap-1">
            <ToolbarButton
              tooltip="Lower"
              small
              onClick={() => onClippingHeightChange(clippingHeight - 0.5)}
            >
              <Minus className="h-3 w-3" />
            </ToolbarButton>
            <Badge variant="outline" className="text-xs tabular-nums">
              {clippingHeight.toFixed(1)}m
            </Badge>
            <ToolbarButton
              tooltip="Higher"
              small
              onClick={() => onClippingHeightChange(clippingHeight + 0.5)}
            >
              <Plus className="h-3 w-3" />
            </ToolbarButton>
          </div>
        </>
      )}

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Actions */}
      <ToolbarButton tooltip="Reset View" onClick={onResetView}>
        <RotateCcw className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton tooltip="Screenshot" onClick={onScreenshot}>
        <Camera className="h-4 w-4" />
      </ToolbarButton>
    </div>
  )
}
