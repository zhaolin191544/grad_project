"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Play,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  Sparkles,
  Code2,
  ListChecks,
  Eye,
  FileDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ParsedRule,
  RuleViolation,
  ComplianceReport,
} from "@/lib/compliance/rule-dsl"
import { BUILTIN_RULES, parseDSL } from "@/lib/compliance/rule-dsl"
import { runComplianceCheck, type CheckProgress } from "@/lib/compliance/engine"

interface CompliancePanelProps {
  getIfcApi: () => { ifcApi: any; modelID: number } | null
  elementTypeMap: Map<number, { type: string; name?: string }> | null
  onHighlightElements: (ids: number[]) => void
  onHighlightElement: (id: number) => void
  onAIGenerateRule?: (prompt: string) => void | Promise<void>
}

type TabType = "rules" | "report" | "custom"

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", label: "错误" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "警告" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10", label: "提示" },
}

export function CompliancePanel({
  getIfcApi,
  elementTypeMap,
  onHighlightElements,
  onHighlightElement,
  onAIGenerateRule,
}: CompliancePanelProps) {
  const [tab, setTab] = useState<TabType>("rules")
  const [rules, setRules] = useState<ParsedRule[]>([...BUILTIN_RULES])
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<CheckProgress | null>(null)
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["门窗规范", "楼梯规范", "通道规范", "空间规范", "消防规范", "结构规范"])
  )

  // Custom rule form
  const [newDSL, setNewDSL] = useState("")
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newCategory, setNewCategory] = useState("自定义规则")
  const [newSeverity, setNewSeverity] = useState<"error" | "warning" | "info">("warning")
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [dslError, setDslError] = useState("")

  // Listen for AI-generated rules
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.rules?.length) {
        const newRules: ParsedRule[] = detail.rules
          .map((r: any) => {
            const parsed = parseDSL(r.dsl)
            if (!parsed) return null
            return {
              id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: r.name || "AI 生成规则",
              description: r.description || r.name,
              category: r.category || "自定义规则",
              severity: r.severity || "warning",
              enabled: true,
              ...parsed,
            } as ParsedRule
          })
          .filter(Boolean)
        if (newRules.length > 0) {
          setRules((prev) => [...prev, ...newRules])
          setTab("rules")
        }
      }
    }
    window.addEventListener("compliance-add-rules", handler)
    return () => window.removeEventListener("compliance-add-rules", handler)
  }, [])

  // Group rules by category
  const rulesByCategory = useMemo(() => {
    const map = new Map<string, ParsedRule[]>()
    rules.forEach((r) => {
      const list = map.get(r.category) || []
      list.push(r)
      map.set(r.category, list)
    })
    return map
  }, [rules])

  const toggleRule = useCallback((id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    )
  }, [])

  const deleteRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const toggleRuleExpand = useCallback((id: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const addCustomRule = useCallback(() => {
    setDslError("")
    const parsed = parseDSL(newDSL)
    if (!parsed) {
      setDslError("DSL 语法错误，请参照格式：IfcDoor.height >= 2100mm")
      return
    }
    if (!newName.trim()) {
      setDslError("请输入规则名称")
      return
    }

    const rule: ParsedRule = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      description: newDesc.trim() || newName.trim(),
      category: newCategory,
      severity: newSeverity,
      enabled: true,
      ...parsed,
    }

    setRules((prev) => [...prev, rule])
    setNewDSL("")
    setNewName("")
    setNewDesc("")
    setDslError("")
    setTab("rules")
  }, [newDSL, newName, newDesc, newCategory, newSeverity])

  const runCheck = useCallback(() => {
    const api = getIfcApi()
    if (!api || !elementTypeMap) return

    setRunning(true)
    setProgress(null)

    // Run in a timeout to allow UI to update
    setTimeout(() => {
      const result = runComplianceCheck(
        rules,
        api.ifcApi,
        api.modelID,
        elementTypeMap,
        (p) => setProgress(p)
      )
      setReport(result)
      setRunning(false)
      setProgress(null)
      setTab("report")
    }, 50)
  }, [rules, getIfcApi, elementTypeMap])

  const highlightViolations = useCallback(
    (violations: RuleViolation[]) => {
      const ids = violations.map((v) => v.elementId)
      onHighlightElements(ids)
    },
    [onHighlightElements]
  )

  const exportReport = useCallback(() => {
    if (!report) return
    const data = {
      title: "IFC 合规性检查报告",
      timestamp: report.timestamp,
      summary: {
        totalChecked: report.totalChecked,
        totalPassed: report.totalPassed,
        totalViolations: report.totalViolations,
        errors: report.errors,
        warnings: report.warnings,
      },
      ruleResults: report.ruleResults,
      violations: report.violations.map((v) => ({
        规则: v.ruleName,
        级别: v.severity,
        构件: v.elementName,
        类型: v.elementType,
        消息: v.message,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `compliance-report-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [report])

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          合规性检查
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          基于建筑规范的 IFC 模型合规性验证
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(
          [
            { key: "rules", label: "规则集", icon: ListChecks },
            { key: "report", label: "检查报告", icon: ShieldCheck },
            { key: "custom", label: "自定义", icon: Code2 },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
              tab === key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "rules" && (
          <div className="p-3 space-y-2">
            {/* Run button */}
            <Button
              onClick={runCheck}
              disabled={running || enabledCount === 0 || !elementTypeMap}
              className="w-full gap-2"
              size="sm"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  检查中...{progress && ` (${progress.current}/${progress.total})`}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  运行合规检查 ({enabledCount} 条规则)
                </>
              )}
            </Button>

            {/* Rule categories */}
            {Array.from(rulesByCategory.entries()).map(([category, catRules]) => (
              <div key={category} className="rounded-lg border">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-accent/50 transition-colors"
                >
                  {expandedCategories.has(category) ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold flex-1">{category}</span>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {catRules.filter((r) => r.enabled).length}/{catRules.length}
                  </Badge>
                </button>

                {expandedCategories.has(category) && (
                  <div className="border-t divide-y">
                    {catRules.map((rule) => {
                      const Sev = SEVERITY_CONFIG[rule.severity]
                      return (
                        <div key={rule.id} className="px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleRule(rule.id)}
                              className={cn(
                                "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                rule.enabled
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/30"
                              )}
                            >
                              {rule.enabled && (
                                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => toggleRuleExpand(rule.id)}
                              className="flex-1 text-left"
                            >
                              <span className="text-xs font-medium">{rule.name}</span>
                            </button>
                            <Sev.icon className={cn("h-3.5 w-3.5", Sev.color)} />
                            {rule.id.startsWith("custom-") && (
                              <button
                                onClick={() => deleteRule(rule.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {expandedRules.has(rule.id) && (
                            <div className="mt-1.5 ml-6 space-y-1">
                              <p className="text-[11px] text-muted-foreground">
                                {rule.description}
                              </p>
                              <code className="block text-[10px] bg-muted px-2 py-1 rounded font-mono">
                                {rule.dsl}
                              </code>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "report" && (
          <div className="p-3 space-y-3">
            {!report ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">尚未运行检查</p>
                <p className="text-xs mt-1">请在规则集标签页中运行合规检查</p>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-lg font-bold text-green-500">{report.totalPassed}</p>
                    <p className="text-[10px] text-muted-foreground">通过</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-lg font-bold text-red-500">{report.errors}</p>
                    <p className="text-[10px] text-muted-foreground">错误</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-lg font-bold text-yellow-500">{report.warnings}</p>
                    <p className="text-[10px] text-muted-foreground">警告</p>
                  </div>
                </div>

                {/* Score */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">合规率</span>
                    <span className="text-sm font-bold">
                      {report.totalChecked > 0
                        ? Math.round((report.totalPassed / report.totalChecked) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        report.totalChecked > 0 &&
                          report.totalPassed / report.totalChecked >= 0.8
                          ? "bg-green-500"
                          : report.totalPassed / report.totalChecked >= 0.5
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      )}
                      style={{
                        width: `${report.totalChecked > 0 ? (report.totalPassed / report.totalChecked) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Rule results */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    各规则结果
                  </p>
                  {report.ruleResults.map((rr) => (
                    <div
                      key={rr.ruleId}
                      className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                    >
                      {rr.failed === 0 ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <span className="text-xs flex-1 truncate">{rr.ruleName}</span>
                      <div className="flex gap-1.5 text-[10px] tabular-nums">
                        {rr.checked > 0 && (
                          <Badge
                            variant={rr.failed === 0 ? "default" : "destructive"}
                            className="text-[10px] h-4"
                          >
                            {rr.passed}/{rr.checked}
                          </Badge>
                        )}
                        {rr.checked === 0 && (
                          <span className="text-muted-foreground">无匹配</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Violations list */}
                {report.violations.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        违规详情 ({report.violations.length})
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => highlightViolations(report.violations)}
                      >
                        <Eye className="h-3 w-3" />
                        全部高亮
                      </Button>
                    </div>

                    {report.violations.map((v, i) => {
                      const Sev = SEVERITY_CONFIG[v.severity]
                      return (
                        <button
                          key={i}
                          onClick={() => onHighlightElement(v.elementId)}
                          className="w-full rounded-lg border p-2.5 text-left hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Sev.icon className={cn("h-3.5 w-3.5 shrink-0", Sev.color)} />
                            <span className="text-xs font-medium flex-1 truncate">
                              {v.elementName}
                            </span>
                            <Badge variant="outline" className="text-[10px] h-4">
                              {v.elementType}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 ml-5.5 line-clamp-2">
                            {v.message}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Export */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={exportReport}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  导出检查报告
                </Button>
              </>
            )}
          </div>
        )}

        {tab === "custom" && (
          <div className="p-3 space-y-4">
            {/* AI Rule Generation */}
            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI 智能生成规则
              </p>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="用自然语言描述规范要求，例如：&#10;所有门的高度不能低于2.1米&#10;走廊宽度至少1.5米"
                rows={3}
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <Button
                size="sm"
                className="w-full gap-2"
                disabled={!aiPrompt.trim() || aiLoading}
                onClick={async () => {
                  if (onAIGenerateRule && aiPrompt.trim()) {
                    setAiLoading(true)
                    try {
                      await onAIGenerateRule(aiPrompt.trim())
                    } finally {
                      setAiLoading(false)
                      setAiPrompt("")
                    }
                  }
                }}
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiLoading ? "生成中..." : "AI 生成规则"}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">
                  或手动编写
                </span>
              </div>
            </div>

            {/* Manual rule form */}
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  规则名称
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：门高度最低标准"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  规则 DSL
                </label>
                <input
                  value={newDSL}
                  onChange={(e) => { setNewDSL(e.target.value); setDslError("") }}
                  placeholder="IfcDoor.height >= 2100mm"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {dslError && (
                  <p className="text-[10px] text-destructive mt-1">{dslError}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  描述说明
                </label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="对该规则的简要说明"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    分类
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option>自定义规则</option>
                    <option>门窗规范</option>
                    <option>楼梯规范</option>
                    <option>通道规范</option>
                    <option>空间规范</option>
                    <option>消防规范</option>
                    <option>结构规范</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    严重级别
                  </label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="error">错误</option>
                    <option value="warning">警告</option>
                    <option value="info">提示</option>
                  </select>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full gap-2"
                onClick={addCustomRule}
              >
                <Plus className="h-3.5 w-3.5" />
                添加规则
              </Button>
            </div>

            {/* DSL syntax reference */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-[11px] font-semibold">DSL 语法参考</p>
              <div className="space-y-1 text-[10px] font-mono text-muted-foreground">
                <p>IfcDoor.height &gt;= 2100mm</p>
                <p>IfcWall.fireRating == &quot;2h&quot;</p>
                <p>IfcSpace.area &gt;= 5m2</p>
                <p>IfcSlab.depth &gt;= 100mm</p>
                <p>IfcWindow.width &gt;= 600mm</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                支持运算符: ==, !=, &gt;=, &lt;=, &gt;, &lt;, contains, exists
              </p>
              <p className="text-[10px] text-muted-foreground">
                支持单位: mm, cm, m, m2, m3
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
