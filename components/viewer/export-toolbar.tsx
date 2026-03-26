"use client"

import { useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Download,
  FileBox,
  FileText,
  Save,
  ChevronDown,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ExportToolbarProps {
  onExportGLTF: () => void
  onExportOBJ: () => void
  onExportIFC: () => void
  onSave: () => Promise<void>
  modificationCount: number
  saving?: boolean
}

export function ExportToolbar({
  onExportGLTF,
  onExportOBJ,
  onExportIFC,
  onSave,
  modificationCount,
  saving,
}: ExportToolbarProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-1.5">
      {/* Save button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border bg-background/95 px-3 h-9 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-accent",
                modificationCount > 0 && "border-primary/50 text-primary"
              )}
              disabled={saving || modificationCount === 0}
              onClick={async () => {
                try {
                  await onSave()
                  alert("保存成功！")
                } catch (err) {
                  alert("保存失败: " + (err instanceof Error ? err.message : String(err)))
                }
              }}
            />
          }
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span>保存</span>
        </TooltipTrigger>
        <TooltipContent>保存修改到原模型</TooltipContent>
      </Tooltip>

      {/* Export dropdown */}
      <div className="relative">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background/95 px-3 h-9 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-accent"
                onClick={() => setOpen(!open)}
              />
            }
          >
            <Download className="h-3.5 w-3.5" />
            <span>导出</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </TooltipTrigger>
          <TooltipContent>导出模型（含修改）</TooltipContent>
        </Tooltip>

        {open && (
          <div className="absolute top-full left-0 mt-2 rounded-lg border bg-background/95 p-1.5 shadow-lg backdrop-blur min-w-[160px] space-y-0.5 z-30">
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-accent transition-colors"
              onClick={() => { onExportGLTF(); setOpen(false) }}
            >
              <FileBox className="h-3.5 w-3.5 text-blue-500" />
              <div className="text-left">
                <p className="font-medium">导出 glTF (.glb)</p>
                <p className="text-[10px] text-muted-foreground">通用 3D 格式，含材质</p>
              </div>
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-accent transition-colors"
              onClick={() => { onExportOBJ(); setOpen(false) }}
            >
              <FileText className="h-3.5 w-3.5 text-green-500" />
              <div className="text-left">
                <p className="font-medium">导出 OBJ (.obj)</p>
                <p className="text-[10px] text-muted-foreground">轻量几何格式</p>
              </div>
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-accent transition-colors"
              onClick={() => { onExportIFC(); setOpen(false) }}
            >
              <FileBox className="h-3.5 w-3.5 text-orange-500" />
              <div className="text-left">
                <p className="font-medium">导出 IFC (.ifc)</p>
                <p className="text-[10px] text-muted-foreground">BIM 原生格式，含属性修改</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
