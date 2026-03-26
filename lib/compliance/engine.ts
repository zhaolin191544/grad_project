/**
 * Compliance Check Engine
 * Evaluates rules against IFC model elements
 */

import type {
  ParsedRule,
  RuleViolation,
  ComplianceReport,
} from "./rule-dsl"
import { extractProperty, evaluateRule } from "./rule-dsl"

export interface CheckProgress {
  current: number
  total: number
  currentRule: string
}

export function runComplianceCheck(
  rules: ParsedRule[],
  ifcApi: any,
  modelID: number,
  elementTypeMap: Map<number, { type: string; name?: string }>,
  onProgress?: (progress: CheckProgress) => void
): ComplianceReport {
  const enabledRules = rules.filter((r) => r.enabled)
  const violations: RuleViolation[] = []
  const ruleResults: ComplianceReport["ruleResults"] = []

  let totalChecked = 0
  let totalPassed = 0

  for (let ri = 0; ri < enabledRules.length; ri++) {
    const rule = enabledRules[ri]
    let checked = 0
    let passed = 0
    let failed = 0

    onProgress?.({
      current: ri + 1,
      total: enabledRules.length,
      currentRule: rule.name,
    })

    // Find all elements matching the target type
    elementTypeMap.forEach((info, expressID) => {
      if (!info.type.toUpperCase().includes(rule.targetType.replace("IFC", ""))) {
        return
      }

      checked++
      totalChecked++

      const actualValue = extractProperty(ifcApi, modelID, expressID, rule.property)
      const passes = evaluateRule(rule, actualValue)

      if (passes) {
        passed++
        totalPassed++
      } else {
        failed++
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          elementId: expressID,
          elementType: info.type,
          elementName: info.name || `Element #${expressID}`,
          message: formatViolationMessage(rule, actualValue),
          actualValue: actualValue,
          expectedValue: rule.value,
          operator: rule.operator,
        })
      }
    })

    ruleResults.push({
      ruleId: rule.id,
      ruleName: rule.name,
      checked,
      passed,
      failed,
    })
  }

  return {
    timestamp: new Date(),
    totalChecked,
    totalPassed,
    totalViolations: violations.length,
    errors: violations.filter((v) => v.severity === "error").length,
    warnings: violations.filter((v) => v.severity === "warning").length,
    infos: violations.filter((v) => v.severity === "info").length,
    violations,
    ruleResults,
  }
}

function formatViolationMessage(
  rule: ParsedRule,
  actualValue: string | number | boolean | null
): string {
  const unit = rule.unit || ""
  const expected = `${rule.operator} ${rule.value}${unit}`

  if (actualValue === null || actualValue === undefined) {
    return `${rule.description}。属性 "${rule.property}" 未找到（期望值: ${expected}）`
  }

  let displayActual: string
  if (typeof actualValue === "number") {
    // Convert from meters to mm for display if value is small
    const displayVal = actualValue < 100 ? actualValue * 1000 : actualValue
    displayActual = `${Math.round(displayVal)}${unit || "mm"}`
  } else {
    displayActual = String(actualValue)
  }

  return `${rule.description}。实际值: ${displayActual}，期望: ${expected}`
}
