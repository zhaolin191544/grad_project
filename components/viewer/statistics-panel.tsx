"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  BarChart3,
  PieChart as PieChartIcon,
  Download,
  DollarSign,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  Box,
  Layers,
  Calculator,
  FileSpreadsheet,
} from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { QuantityData } from "@/hooks/use-quantity-stats"
import * as XLSX from "xlsx"

// Chart colors
const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#818cf8", "#4f46e5", "#7c3aed", "#5b21b6",
  "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8",
  "#06b6d4", "#0891b2", "#14b8a6", "#10b981",
]

interface UnitPrice {
  type: string
  price: number
  unit: string
}

const DEFAULT_UNIT_PRICES: UnitPrice[] = [
  { type: "IFCWALL", price: 350, unit: "元/个" },
  { type: "IFCWALLSTANDARDCASE", price: 350, unit: "元/个" },
  { type: "IFCSLAB", price: 280, unit: "元/个" },
  { type: "IFCCOLUMN", price: 500, unit: "元/个" },
  { type: "IFCBEAM", price: 420, unit: "元/个" },
  { type: "IFCDOOR", price: 1200, unit: "元/个" },
  { type: "IFCWINDOW", price: 800, unit: "元/个" },
  { type: "IFCSTAIR", price: 2000, unit: "元/个" },
  { type: "IFCROOF", price: 600, unit: "元/个" },
  { type: "IFCRAILING", price: 150, unit: "元/个" },
  { type: "IFCFURNISHINGELEMENT", price: 300, unit: "元/个" },
  { type: "IFCPLATE", price: 200, unit: "元/个" },
  { type: "IFCMEMBER", price: 180, unit: "元/个" },
]

interface StatisticsPanelProps {
  data: QuantityData | null
  onRequestAIInsight?: (summary: string) => void
}

type TabType = "overview" | "cost" | "export"

export function StatisticsPanel({ data, onRequestAIInsight }: StatisticsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview")
  const [unitPrices, setUnitPrices] = useState<UnitPrice[]>(DEFAULT_UNIT_PRICES)
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set())
  const [aiLoading, setAiLoading] = useState(false)

  const toggleFloor = (idx: number) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const updatePrice = (type: string, price: number) => {
    setUnitPrices((prev) =>
      prev.map((p) => (p.type === type ? { ...p, price } : p))
    )
  }

  // Calculate total cost
  const costItems = data
    ? data.elementsByType
        .map((el) => {
          const priceInfo = unitPrices.find((p) => p.type === el.type)
          return {
            type: el.type,
            count: el.count,
            unitPrice: priceInfo?.price || 0,
            unit: priceInfo?.unit || "元/个",
            total: el.count * (priceInfo?.price || 0),
          }
        })
        .filter((item) => item.unitPrice > 0)
    : []

  const totalCost = costItems.reduce((sum, item) => sum + item.total, 0)

  // Export to Excel
  const handleExport = useCallback(() => {
    if (!data) return

    const wb = XLSX.utils.book_new()

    // Sheet 1: Overview
    const overviewData = [
      ["IFC模型工程量统计报表", "", "", ""],
      ["", "", "", ""],
      ["基本信息", "", "", ""],
      ["总构件数", data.totalElements, "", ""],
      ["总楼层数", data.totalFloors, "", ""],
      ["总顶点数", data.geometryStats.totalVertices, "", ""],
      ["总面片数", data.geometryStats.totalFaces, "", ""],
      ["估算表面积(m²)", data.geometryStats.estimatedArea, "", ""],
      ["估算包围盒体积(m³)", data.geometryStats.estimatedVolume, "", ""],
      ["", "", "", ""],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(overviewData)
    XLSX.utils.book_append_sheet(wb, ws1, "概览")

    // Sheet 2: Element Types
    const typeHeader = ["构件类型", "数量", "占比(%)"]
    const typeRows = data.elementsByType.map((e) => [
      e.type,
      e.count,
      e.percentage,
    ])
    const ws2 = XLSX.utils.aoa_to_sheet([typeHeader, ...typeRows])
    XLSX.utils.book_append_sheet(wb, ws2, "构件统计")

    // Sheet 3: Floor Statistics
    const floorHeader = ["楼层", "构件数量", "构件类型分布"]
    const floorRows = data.floorStats.map((f) => [
      f.name,
      f.elementCount,
      Object.entries(f.types)
        .map(([t, c]) => `${t}:${c}`)
        .join(", "),
    ])
    const ws3 = XLSX.utils.aoa_to_sheet([floorHeader, ...floorRows])
    XLSX.utils.book_append_sheet(wb, ws3, "楼层统计")

    // Sheet 4: Cost Estimation
    const costHeader = ["构件类型", "数量", "单价(元)", "单位", "小计(元)"]
    const costRows = costItems.map((c) => [
      c.type,
      c.count,
      c.unitPrice,
      c.unit,
      c.total,
    ])
    costRows.push(["合计", "", "", "", totalCost])
    const ws4 = XLSX.utils.aoa_to_sheet([costHeader, ...costRows])
    XLSX.utils.book_append_sheet(wb, ws4, "造价估算")

    XLSX.writeFile(wb, `工程量统计报表_${new Date().toLocaleDateString()}.xlsx`)
  }, [data, costItems, totalCost])

  // AI Insight
  const handleAIInsight = useCallback(() => {
    if (!data || !onRequestAIInsight) return
    setAiLoading(true)

    const summary = `请分析以下建筑模型的工程量数据并给出专业意见：
- 总构件数: ${data.totalElements}
- 总楼层数: ${data.totalFloors}
- 估算总表面积: ${data.geometryStats.estimatedArea.toFixed(1)} m²
- 估算包围盒体积: ${data.geometryStats.estimatedVolume.toFixed(1)} m³
- 构件分布: ${data.elementsByType.slice(0, 8).map((e) => `${e.type}(${e.count}个)`).join("、")}
- 楼层信息: ${data.floorStats.map((f) => `${f.name}(${f.elementCount}个构件)`).join("、")}
- 预估总造价: ${totalCost.toLocaleString()} 元

请从以下角度分析：1. 构件分布是否合理 2. 结构特点 3. 造价建议 4. 可能的优化方向`

    onRequestAIInsight(summary)
    setTimeout(() => setAiLoading(false), 1000)
  }, [data, onRequestAIInsight, totalCost])

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Loading statistics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">工程量统计</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleExport}
        >
          <FileSpreadsheet className="h-3 w-3" />
          导出Excel
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {[
          { key: "overview" as TabType, label: "总览", icon: PieChartIcon },
          { key: "cost" as TabType, label: "造价", icon: Calculator },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <OverviewTab
            data={data}
            expandedFloors={expandedFloors}
            onToggleFloor={toggleFloor}
          />
        )}
        {activeTab === "cost" && (
          <CostTab
            data={data}
            costItems={costItems}
            totalCost={totalCost}
            unitPrices={unitPrices}
            onUpdatePrice={updatePrice}
          />
        )}
      </div>

      {/* AI Insight button */}
      {onRequestAIInsight && (
        <div className="border-t p-3">
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={handleAIInsight}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 智能分析
          </Button>
        </div>
      )}
    </div>
  )
}

// Overview Tab
function OverviewTab({
  data,
  expandedFloors,
  onToggleFloor,
}: {
  data: QuantityData
  expandedFloors: Set<number>
  onToggleFloor: (idx: number) => void
}) {
  return (
    <div className="space-y-4 p-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Box className="h-4 w-4" />}
          label="总构件"
          value={data.totalElements.toString()}
        />
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="楼层"
          value={data.totalFloors.toString()}
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="顶点数"
          value={formatNumber(data.geometryStats.totalVertices)}
        />
        <StatCard
          icon={<PieChartIcon className="h-4 w-4" />}
          label="面片数"
          value={formatNumber(data.geometryStats.totalFaces)}
        />
      </div>

      {/* Geometry info */}
      <div className="rounded-lg border p-3">
        <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
          几何信息
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">估算表面积</span>
            <span className="font-mono font-medium">
              {data.geometryStats.estimatedArea.toFixed(1)} m²
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">包围盒体积</span>
            <span className="font-mono font-medium">
              {data.geometryStats.estimatedVolume.toFixed(1)} m³
            </span>
          </div>
          {data.geometryStats.boundingBox && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">尺寸 (长×宽×高)</span>
              <span className="font-mono font-medium text-[10px]">
                {(data.geometryStats.boundingBox.max.x - data.geometryStats.boundingBox.min.x).toFixed(1)} ×{" "}
                {(data.geometryStats.boundingBox.max.z - data.geometryStats.boundingBox.min.z).toFixed(1)} ×{" "}
                {(data.geometryStats.boundingBox.max.y - data.geometryStats.boundingBox.min.y).toFixed(1)} m
              </span>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Type Distribution Pie Chart */}
      <div>
        <h4 className="mb-3 text-xs font-semibold text-muted-foreground">
          构件类型分布
        </h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.typeDistribution}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                dataKey="value"
                nameKey="name"
                paddingAngle={2}
              >
                {data.typeDistribution.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "10px" }}
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Type Table */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
          构件明细
        </h4>
        <div className="max-h-48 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">类型</th>
                <th className="px-2 py-1.5 text-right font-medium">数量</th>
                <th className="px-2 py-1.5 text-right font-medium">占比</th>
              </tr>
            </thead>
            <tbody>
              {data.elementsByType.map((el, idx) => (
                <tr key={el.type} className="border-t">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="truncate">{el.type.replace("IFC", "")}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {el.count}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                    {el.percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Separator />

      {/* Floor Bar Chart */}
      {data.floorDistribution.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-semibold text-muted-foreground">
            楼层构件分布
          </h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.floorDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10 }}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                  }}
                />
                <Bar
                  dataKey="elements"
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                  name="构件数"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Floor Detail */}
      {data.floorStats.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            楼层明细
          </h4>
          <div className="space-y-1">
            {data.floorStats.map((floor, idx) => (
              <div key={idx} className="rounded-lg border">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
                  onClick={() => onToggleFloor(idx)}
                >
                  {expandedFloors.has(idx) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span className="font-medium">{floor.name}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {floor.elementCount} 构件
                  </Badge>
                </button>
                {expandedFloors.has(idx) && (
                  <div className="border-t px-3 py-2">
                    {Object.entries(floor.types).map(([type, count]) => (
                      <div
                        key={type}
                        className="flex justify-between py-0.5 text-[11px]"
                      >
                        <span className="text-muted-foreground">
                          {type.replace("IFC", "")}
                        </span>
                        <span className="font-mono">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Cost Tab
function CostTab({
  data,
  costItems,
  totalCost,
  unitPrices,
  onUpdatePrice,
}: {
  data: QuantityData
  costItems: { type: string; count: number; unitPrice: number; unit: string; total: number }[]
  totalCost: number
  unitPrices: UnitPrice[]
  onUpdatePrice: (type: string, price: number) => void
}) {
  return (
    <div className="space-y-4 p-4">
      {/* Total Cost Card */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center">
        <p className="mb-1 text-xs text-muted-foreground">预估总造价</p>
        <p className="text-2xl font-bold text-primary">
          ¥{totalCost.toLocaleString()}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          基于 {costItems.length} 种构件类型估算
        </p>
      </div>

      {/* Cost Breakdown Chart */}
      {costItems.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-semibold text-muted-foreground">
            造价构成
          </h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={costItems.slice(0, 8).map((c) => ({
                  name: c.type.replace("IFC", ""),
                  cost: c.total,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9 }}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                  }}
                  formatter={(value: any) => [`¥${Number(value).toLocaleString()}`, "造价"]}
                />
                <Bar
                  dataKey="cost"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  name="造价(元)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <Separator />

      {/* Editable Unit Prices */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
          单价设置（可编辑）
        </h4>
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">类型</th>
                <th className="px-2 py-1.5 text-right font-medium">数量</th>
                <th className="px-2 py-1.5 text-right font-medium">单价</th>
                <th className="px-2 py-1.5 text-right font-medium">小计</th>
              </tr>
            </thead>
            <tbody>
              {data.elementsByType.map((el) => {
                const priceInfo = unitPrices.find((p) => p.type === el.type)
                const price = priceInfo?.price || 0
                const subtotal = el.count * price
                return (
                  <tr key={el.type} className="border-t">
                    <td className="px-2 py-1.5 truncate max-w-[100px]">
                      {el.type.replace("IFC", "")}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {el.count}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        value={price}
                        onChange={(e) =>
                          onUpdatePrice(el.type, Number(e.target.value))
                        }
                        className="w-16 rounded border bg-background px-1.5 py-0.5 text-right font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                        min={0}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {subtotal > 0 ? `¥${subtotal.toLocaleString()}` : "-"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur-sm">
              <tr className="border-t-2">
                <td colSpan={3} className="px-2 py-2 text-right font-semibold">
                  合计
                </td>
                <td className="px-2 py-2 text-right font-mono font-bold text-primary">
                  ¥{totalCost.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// Stat Card
function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}
