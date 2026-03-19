"use client"

import type { FPSData } from "@/hooks/use-fps-monitor"
import type { PerfMetrics } from "@/hooks/use-perf-tracker"
import {
  Activity,
  Clock,
  Cpu,
  HardDrive,
  Triangle,
  Zap,
  Brain,
  Box,
} from "lucide-react"

interface PerformancePanelProps {
  fps: FPSData
  metrics: PerfMetrics
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: any
  label: string
  value: string | number | null
  unit?: string
  color?: string
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${color || ""}`} />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">
        {value ?? "—"}
        {unit && value != null && (
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {unit}
          </span>
        )}
      </p>
    </div>
  )
}

function FPSBar({ value, max = 60 }: { value: number; max?: number }) {
  const percent = Math.min((value / max) * 100, 100)
  const color =
    value >= 50
      ? "bg-green-500"
      : value >= 30
        ? "bg-yellow-500"
        : "bg-red-500"
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function MiniChart({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 60)
  const min = 0
  const w = 280
  const h = 48

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * h
    return `${x},${y}`
  })

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-12"
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
      />
      {/* 30fps warning line */}
      <line
        x1="0"
        y1={h - (30 / max) * h}
        x2={w}
        y2={h - (30 / max) * h}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="4 2"
        className="text-yellow-500/50"
      />
    </svg>
  )
}

export function PerformancePanel({ fps, metrics }: PerformancePanelProps) {
  const fpsColor =
    fps.current >= 50
      ? "text-green-500"
      : fps.current >= 30
        ? "text-yellow-500"
        : "text-red-500"

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" />
          性能监控
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* FPS Section */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            渲染帧率
          </p>
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-2xl font-bold tabular-nums ${fpsColor}`}>
                {fps.current}
              </span>
              <span className="text-xs text-muted-foreground">FPS</span>
            </div>
            <FPSBar value={fps.current} />
            <MiniChart data={fps.history} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>最低: {fps.min === Infinity ? "—" : fps.min}</span>
              <span>平均: {fps.avg || "—"}</span>
              <span>最高: {fps.max || "—"}</span>
            </div>
          </div>
        </div>

        {/* Loading Performance */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            加载性能
          </p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              icon={Clock}
              label="模型加载"
              value={
                metrics.modelLoadTime != null
                  ? metrics.modelLoadTime >= 1000
                    ? (metrics.modelLoadTime / 1000).toFixed(1)
                    : metrics.modelLoadTime
                  : null
              }
              unit={
                metrics.modelLoadTime != null && metrics.modelLoadTime >= 1000
                  ? "s"
                  : "ms"
              }
              color="text-blue-500"
            />
            <MetricCard
              icon={HardDrive}
              label="文件大小"
              value={
                metrics.modelFileSize != null
                  ? (metrics.modelFileSize / 1024 / 1024).toFixed(1)
                  : null
              }
              unit="MB"
              color="text-purple-500"
            />
          </div>
        </div>

        {/* AI Performance */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            AI 响应
          </p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              icon={Brain}
              label="最近延迟"
              value={
                metrics.aiResponseLatency != null
                  ? metrics.aiResponseLatency >= 1000
                    ? (metrics.aiResponseLatency / 1000).toFixed(1)
                    : metrics.aiResponseLatency
                  : null
              }
              unit={
                metrics.aiResponseLatency != null &&
                metrics.aiResponseLatency >= 1000
                  ? "s"
                  : "ms"
              }
              color="text-green-500"
            />
            <MetricCard
              icon={Zap}
              label="平均延迟"
              value={
                metrics.aiAvgLatency != null
                  ? metrics.aiAvgLatency >= 1000
                    ? (metrics.aiAvgLatency / 1000).toFixed(1)
                    : metrics.aiAvgLatency
                  : null
              }
              unit={
                metrics.aiAvgLatency != null && metrics.aiAvgLatency >= 1000
                  ? "s"
                  : "ms"
              }
              color="text-orange-500"
            />
          </div>
        </div>

        {/* Renderer Stats */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            渲染统计
          </p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              icon={Triangle}
              label="三角面"
              value={
                metrics.triangles != null
                  ? metrics.triangles >= 1000000
                    ? (metrics.triangles / 1000000).toFixed(1) + "M"
                    : metrics.triangles >= 1000
                      ? (metrics.triangles / 1000).toFixed(0) + "K"
                      : metrics.triangles
                  : null
              }
            />
            <MetricCard
              icon={Cpu}
              label="Draw Calls"
              value={metrics.drawCalls}
            />
            <MetricCard
              icon={Box}
              label="顶点数"
              value={
                metrics.modelVertices != null
                  ? metrics.modelVertices >= 1000000
                    ? (metrics.modelVertices / 1000000).toFixed(1) + "M"
                    : metrics.modelVertices >= 1000
                      ? (metrics.modelVertices / 1000).toFixed(0) + "K"
                      : metrics.modelVertices
                  : null
              }
            />
            <MetricCard
              icon={HardDrive}
              label="内存使用"
              value={metrics.memoryUsage}
              unit="MB"
              color="text-red-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
