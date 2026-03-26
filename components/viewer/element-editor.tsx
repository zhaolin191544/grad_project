"use client"

import { useState, useCallback, useEffect } from "react"
import type { IFCElementInfo } from "@/hooks/use-ifc-loader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Move,
  RotateCcw,
  Maximize2,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Undo2,
  Save,
  Pencil,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type TransformMode = "translate" | "rotate" | "scale" | null

export interface ElementModification {
  expressID: number
  type: "transform" | "property" | "delete" | "hide"
  property?: string
  oldValue?: any
  newValue?: any
}

export interface PropertyEdit {
  key: string
  value: string
  originalValue: string
}

interface ElementEditorProps {
  selectedElement: IFCElementInfo | null
  properties: Record<string, string>
  transformMode: TransformMode
  onTransformModeChange: (mode: TransformMode) => void
  onPropertyChange: (key: string, value: string) => void
  onDeleteElement: () => void
  onHideElement: () => void
  onDuplicateElement: () => void
  onUndoLast: () => void
  hiddenElements: Set<number>
  modifications: ElementModification[]
  onClearSelection: () => void
}

export function ElementEditor({
  selectedElement,
  properties,
  transformMode,
  onTransformModeChange,
  onPropertyChange,
  onDeleteElement,
  onHideElement,
  onDuplicateElement,
  onUndoLast,
  hiddenElements,
  modifications,
  onClearSelection,
}: ElementEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [propsExpanded, setPropsExpanded] = useState(true)
  const [transformExpanded, setTransformExpanded] = useState(true)

  const isHidden = selectedElement ? hiddenElements.has(selectedElement.expressID) : false

  const startEdit = (key: string, value: string) => {
    setEditingKey(key)
    setEditValue(value)
  }

  const commitEdit = () => {
    if (editingKey && editValue !== properties[editingKey]) {
      onPropertyChange(editingKey, editValue)
    }
    setEditingKey(null)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditValue("")
  }

  if (!selectedElement) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Pencil className="mb-3 h-10 w-10 text-muted-foreground/20" />
        <p className="text-sm font-medium text-muted-foreground">选择一个构件</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          点击模型中的构件以编辑其属性
        </p>
        {modifications.length > 0 && (
          <div className="mt-6 w-full">
            <Separator className="mb-3" />
            <p className="text-xs text-muted-foreground">
              已有 <span className="font-semibold text-foreground">{modifications.length}</span> 项修改
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{selectedElement.name}</h3>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={onClearSelection}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="secondary" className="text-[10px]">{selectedElement.type}</Badge>
            <span className="text-[10px] text-muted-foreground font-mono">#{selectedElement.expressID}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Transform tools */}
        <div className="p-3">
          <button
            className="flex w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            onClick={() => setTransformExpanded(!transformExpanded)}
          >
            {transformExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            变换工具
          </button>
          {transformExpanded && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1">
                <Button
                  variant={transformMode === "translate" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => onTransformModeChange(transformMode === "translate" ? null : "translate")}
                >
                  <Move className="mr-1.5 h-3.5 w-3.5" />
                  移动
                </Button>
                <Button
                  variant={transformMode === "rotate" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => onTransformModeChange(transformMode === "rotate" ? null : "rotate")}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  旋转
                </Button>
                <Button
                  variant={transformMode === "scale" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => onTransformModeChange(transformMode === "scale" ? null : "scale")}
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  缩放
                </Button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[11px]"
                  onClick={onHideElement}
                >
                  {isHidden ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}
                  {isHidden ? "显示" : "隐藏"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[11px]"
                  onClick={onDuplicateElement}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  复制
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[11px] text-destructive hover:text-destructive"
                  onClick={onDeleteElement}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  删除
                </Button>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Properties */}
        <div className="p-3">
          <button
            className="flex w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            onClick={() => setPropsExpanded(!propsExpanded)}
          >
            {propsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            属性参数
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
              {Object.keys(properties).length}
            </Badge>
          </button>
          {propsExpanded && (
            <div className="mt-2 space-y-1">
              {Object.entries(properties).length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">无可编辑属性</p>
              ) : (
                Object.entries(properties).map(([key, value]) => (
                  <div
                    key={key}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
                  >
                    <span className="text-[11px] text-muted-foreground w-24 shrink-0 truncate" title={key}>
                      {key}
                    </span>
                    {editingKey === key ? (
                      <div className="flex flex-1 items-center gap-1">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit()
                            if (e.key === "Escape") cancelEdit()
                          }}
                          onBlur={commitEdit}
                          className="h-6 flex-1 rounded border bg-background px-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center gap-1 min-w-0">
                        <span className="text-[11px] truncate flex-1" title={value}>
                          {value}
                        </span>
                        <button
                          className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded hover:bg-accent shrink-0"
                          onClick={() => startEdit(key, value)}
                        >
                          <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Modification history */}
        {modifications.length > 0 && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                修改记录
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onUndoLast}>
                <Undo2 className="mr-1 h-3 w-3" />
                撤销
              </Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {modifications.slice(-10).reverse().map((mod, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    mod.type === "delete" ? "bg-red-500" :
                    mod.type === "hide" ? "bg-yellow-500" :
                    mod.type === "transform" ? "bg-blue-500" :
                    "bg-green-500"
                  )} />
                  <span className="truncate">
                    #{mod.expressID}{" "}
                    {mod.type === "delete" ? "已删除" :
                     mod.type === "hide" ? "已隐藏" :
                     mod.type === "transform" ? "已变换" :
                     `${mod.property}: ${mod.oldValue} → ${mod.newValue}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
