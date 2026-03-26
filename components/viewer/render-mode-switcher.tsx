"use client"

import { useState } from "react"
import type { RenderMode, HeatmapConfig } from "@/hooks/use-render-modes"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sun,
  Grid3x3,
  Eye,
  Pencil,
  Flame,
  Orbit,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface RenderModeSwitcherProps {
  activeMode: RenderMode
  onModeChange: (mode: RenderMode) => void
  onHeatmapChange?: (attribute: "area" | "cost" | "volume") => void
  heatmapAttribute?: string
}

const MODES: { mode: RenderMode; icon: any; label: string; description: string }[] = [
  { mode: "realistic", icon: Sun, label: "真实感", description: "标准光照渲染" },
  { mode: "ssao", icon: Orbit, label: "SSAO", description: "环境光遮蔽增强深度感" },
  { mode: "edge", icon: Pencil, label: "线稿", description: "建筑图纸风格描边" },
  { mode: "wireframe", icon: Grid3x3, label: "线框", description: "线框模式" },
  { mode: "xray", icon: Eye, label: "X-Ray", description: "透视模式" },
  { mode: "heatmap", icon: Flame, label: "热力图", description: "按属性值着色" },
]

const HEATMAP_ATTRS: { key: "area" | "cost" | "volume"; label: string }[] = [
  { key: "area", label: "面积" },
  { key: "cost", label: "造价" },
  { key: "volume", label: "体积" },
]

export function RenderModeSwitcher({
  activeMode,
  onModeChange,
  onHeatmapChange,
  heatmapAttribute,
}: RenderModeSwitcherProps) {
  const [heatmapOpen, setHeatmapOpen] = useState(false)

  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
      {MODES.map(({ mode, icon: Icon, label, description }) => {
        const isActive = activeMode === mode

        if (mode === "heatmap") {
          return (
            <div key={mode} className="relative">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      className={cn(
                        "inline-flex items-center justify-center gap-0.5 rounded-md px-2 h-8 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActive && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      )}
                      onClick={() => {
                        if (isActive) {
                          setHeatmapOpen(!heatmapOpen)
                        } else {
                          onModeChange(mode)
                          onHeatmapChange?.("area")
                          setHeatmapOpen(true)
                        }
                      }}
                    />
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </TooltipTrigger>
                <TooltipContent>{description}</TooltipContent>
              </Tooltip>

              {/* Heatmap attribute dropdown */}
              {heatmapOpen && isActive && (
                <div className="absolute top-full left-0 mt-2 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur min-w-[100px] z-30">
                  {HEATMAP_ATTRS.map((attr) => (
                    <button
                      key={attr.key}
                      className={cn(
                        "flex w-full items-center rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-accent",
                        heatmapAttribute === attr.key && "bg-primary/10 text-primary font-medium"
                      )}
                      onClick={() => {
                        onHeatmapChange?.(attr.key)
                        setHeatmapOpen(false)
                      }}
                    >
                      {attr.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }

        return (
          <Tooltip key={mode}>
            <TooltipTrigger
              render={
                <button
                  className={cn(
                    "inline-flex items-center justify-center gap-1 rounded-md px-2 h-8 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  )}
                  onClick={() => {
                    onModeChange(mode)
                    setHeatmapOpen(false)
                  }}
                />
              }
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
