/**
 * IFC Compliance Rule DSL Parser & Evaluator
 *
 * Syntax examples:
 *   IfcDoor.height >= 2100mm
 *   IfcWall.fireRating == "2h"
 *   IfcSpace.area >= 5m2
 *   IfcStairFlight.riserHeight <= 175mm
 *   IfcDoor.width >= 900mm
 */

export interface ParsedRule {
  id: string
  name: string
  description: string
  category: string
  severity: "error" | "warning" | "info"
  targetType: string           // e.g. "IFCDOOR"
  property: string             // e.g. "height", "fireRating", "area"
  operator: "==" | "!=" | ">=" | "<=" | ">" | "<" | "contains" | "exists"
  value: string | number | boolean
  unit?: string                // mm, m, m2, etc.
  dsl: string                  // original DSL string
  enabled: boolean
}

export interface RuleViolation {
  ruleId: string
  ruleName: string
  severity: "error" | "warning" | "info"
  elementId: number
  elementType: string
  elementName: string
  message: string
  actualValue: string | number | boolean | null
  expectedValue: string | number | boolean
  operator: string
}

export interface ComplianceReport {
  timestamp: Date
  totalChecked: number
  totalPassed: number
  totalViolations: number
  errors: number
  warnings: number
  infos: number
  violations: RuleViolation[]
  ruleResults: {
    ruleId: string
    ruleName: string
    checked: number
    passed: number
    failed: number
  }[]
}

// Parse a DSL expression like "IfcDoor.height >= 2100mm"
export function parseDSL(dsl: string): Omit<ParsedRule, "id" | "name" | "description" | "category" | "severity" | "enabled"> | null {
  const trimmed = dsl.trim()

  // Pattern: TypeName.property operator value[unit]
  const match = trimmed.match(
    /^(Ifc\w+)\.(\w+)\s*(==|!=|>=|<=|>|<|contains|exists)\s*(.+)$/i
  )
  if (!match) return null

  const [, typeName, property, operator, rawValue] = match

  // Parse value and unit
  let value: string | number | boolean = rawValue.trim()
  let unit: string | undefined

  // Check for quoted string
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
    value = value.slice(1, -1)
  }
  // Check for number with unit
  else if (/^[\d.]+\s*(mm|m|m2|m3|cm|%)$/.test(value)) {
    const numMatch = value.match(/^([\d.]+)\s*(mm|m|m2|m3|cm|%)$/)!
    value = parseFloat(numMatch[1])
    unit = numMatch[2]
  }
  // Check for plain number
  else if (/^[\d.]+$/.test(value)) {
    value = parseFloat(value)
  }
  // Check for boolean
  else if (value === "true") {
    value = true
  } else if (value === "false") {
    value = false
  }

  return {
    targetType: typeName.toUpperCase(),
    property,
    operator: operator as ParsedRule["operator"],
    value,
    unit,
    dsl: trimmed,
  }
}

// Convert value to millimeters for comparison
function toMillimeters(value: number, unit?: string): number {
  switch (unit) {
    case "m": return value * 1000
    case "cm": return value * 10
    case "m2": return value * 1000000 // area in mm2
    case "m3": return value * 1000000000 // volume in mm3
    default: return value // assume mm
  }
}

// Extract a property value from an IFC element
export function extractProperty(
  ifcApi: any,
  modelID: number,
  expressID: number,
  property: string
): string | number | boolean | null {
  try {
    const line = ifcApi.GetLine(modelID, expressID, true)
    if (!line) return null

    // Direct property access (case-insensitive search)
    const propLower = property.toLowerCase()

    // Common computed properties
    switch (propLower) {
      case "height":
      case "overallheight":
        return line.OverallHeight?.value ?? line.Height?.value ?? null
      case "width":
      case "overallwidth":
        return line.OverallWidth?.value ?? line.Width?.value ?? null
      case "depth":
      case "overalldepth":
        return line.OverallDepth?.value ?? line.Depth?.value ?? null
      case "area":
        return line.Area?.value ?? null
      case "volume":
        return line.Volume?.value ?? null
      case "name":
        return line.Name?.value ?? null
      case "description":
        return line.Description?.value ?? null
      case "objecttype":
        return line.ObjectType?.value ?? null
      case "tag":
        return line.Tag?.value ?? null
    }

    // Try direct property access
    for (const key of Object.keys(line)) {
      if (key.toLowerCase() === propLower) {
        const val = line[key]
        if (val?.value !== undefined) return val.value
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return val
      }
    }

    // Try to find in property sets
    return extractFromPropertySets(ifcApi, modelID, expressID, property)
  } catch {
    return null
  }
}

function extractFromPropertySets(
  ifcApi: any,
  modelID: number,
  expressID: number,
  property: string
): string | number | boolean | null {
  try {
    // Find IFCRELDEFINESBYPROPERTIES relationships
    const relDefs = ifcApi.GetLineIDsWithType(modelID, 4186316022) // IFCRELDEFINESBYPROPERTIES
    for (let i = 0; i < relDefs.size(); i++) {
      const relId = relDefs.get(i)
      try {
        const rel = ifcApi.GetLine(modelID, relId)
        const relatedObjects = rel.RelatedObjects
        if (!relatedObjects) continue

        let found = false
        for (let j = 0; j < relatedObjects.length; j++) {
          if (relatedObjects[j].value === expressID) {
            found = true
            break
          }
        }
        if (!found) continue

        // Get the property set
        const psetRef = rel.RelatingPropertyDefinition?.value
        if (!psetRef) continue

        const pset = ifcApi.GetLine(modelID, psetRef, true)
        if (!pset?.HasProperties) continue

        for (let k = 0; k < pset.HasProperties.length; k++) {
          const propRef = pset.HasProperties[k]
          try {
            const prop = ifcApi.GetLine(modelID, propRef.value, true)
            if (prop?.Name?.value?.toLowerCase() === property.toLowerCase()) {
              // IFCPROPERTYSINGLEVALUE
              if (prop.NominalValue?.value !== undefined) {
                return prop.NominalValue.value
              }
            }
          } catch {
            continue
          }
        }
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return null
}

// Evaluate a single rule against a value
export function evaluateRule(
  rule: ParsedRule,
  actualValue: string | number | boolean | null
): boolean {
  if (rule.operator === "exists") {
    return actualValue !== null && actualValue !== undefined
  }

  if (actualValue === null || actualValue === undefined) {
    return false // Can't compare null values
  }

  const expected = rule.value
  const op = rule.operator

  // Numeric comparison
  if (typeof expected === "number" && typeof actualValue === "number") {
    const expectedMM = toMillimeters(expected, rule.unit)
    // IFC values are typically in meters, convert to mm
    const actualMM = actualValue < 100 ? actualValue * 1000 : actualValue

    switch (op) {
      case "==": return Math.abs(actualMM - expectedMM) < 1
      case "!=": return Math.abs(actualMM - expectedMM) >= 1
      case ">=": return actualMM >= expectedMM - 0.5
      case "<=": return actualMM <= expectedMM + 0.5
      case ">": return actualMM > expectedMM
      case "<": return actualMM < expectedMM
      default: return false
    }
  }

  // String comparison
  const actualStr = String(actualValue)
  const expectedStr = String(expected)

  switch (op) {
    case "==": return actualStr === expectedStr
    case "!=": return actualStr !== expectedStr
    case "contains": return actualStr.toLowerCase().includes(expectedStr.toLowerCase())
    default: return false
  }
}

// Built-in rules for Chinese building codes
export const BUILTIN_RULES: ParsedRule[] = [
  {
    id: "door-height-min",
    name: "门高度最低标准",
    description: "根据GB50096-2011，户门门洞口高度不应低于2000mm",
    category: "门窗规范",
    severity: "error",
    targetType: "IFCDOOR",
    property: "height",
    operator: ">=",
    value: 2000,
    unit: "mm",
    dsl: "IfcDoor.height >= 2000mm",
    enabled: true,
  },
  {
    id: "door-width-min",
    name: "门宽度最低标准",
    description: "根据GB50096-2011，户门门洞口宽度不应小于900mm",
    category: "门窗规范",
    severity: "error",
    targetType: "IFCDOOR",
    property: "width",
    operator: ">=",
    value: 900,
    unit: "mm",
    dsl: "IfcDoor.width >= 900mm",
    enabled: true,
  },
  {
    id: "window-height-min",
    name: "窗户高度标准",
    description: "普通窗户的高度一般不低于600mm",
    category: "门窗规范",
    severity: "warning",
    targetType: "IFCWINDOW",
    property: "height",
    operator: ">=",
    value: 600,
    unit: "mm",
    dsl: "IfcWindow.height >= 600mm",
    enabled: true,
  },
  {
    id: "stair-riser-max",
    name: "楼梯踏步高度上限",
    description: "根据GB50096-2011，楼梯踏步高度不应大于175mm",
    category: "楼梯规范",
    severity: "error",
    targetType: "IFCSTAIRFLIGHT",
    property: "riserHeight",
    operator: "<=",
    value: 175,
    unit: "mm",
    dsl: "IfcStairFlight.riserHeight <= 175mm",
    enabled: true,
  },
  {
    id: "stair-tread-min",
    name: "楼梯踏步宽度下限",
    description: "根据GB50096-2011，楼梯踏面宽度不应小于260mm",
    category: "楼梯规范",
    severity: "error",
    targetType: "IFCSTAIRFLIGHT",
    property: "treadLength",
    operator: ">=",
    value: 260,
    unit: "mm",
    dsl: "IfcStairFlight.treadLength >= 260mm",
    enabled: true,
  },
  {
    id: "corridor-width-min",
    name: "走廊最小宽度",
    description: "通廊式住宅的走廊净宽不应小于1200mm",
    category: "通道规范",
    severity: "warning",
    targetType: "IFCSPACE",
    property: "width",
    operator: ">=",
    value: 1200,
    unit: "mm",
    dsl: "IfcSpace.width >= 1200mm",
    enabled: true,
  },
  {
    id: "room-height-min",
    name: "房间净高标准",
    description: "住宅层高不应低于2800mm",
    category: "空间规范",
    severity: "warning",
    targetType: "IFCSPACE",
    property: "height",
    operator: ">=",
    value: 2800,
    unit: "mm",
    dsl: "IfcSpace.height >= 2800mm",
    enabled: true,
  },
  {
    id: "wall-fire-rating",
    name: "防火墙耐火等级",
    description: "防火墙的耐火极限不应低于3.00h",
    category: "消防规范",
    severity: "error",
    targetType: "IFCWALL",
    property: "fireRating",
    operator: "==",
    value: "3h",
    dsl: 'IfcWall.fireRating == "3h"',
    enabled: false,
  },
  {
    id: "slab-thickness-min",
    name: "楼板最小厚度",
    description: "现浇钢筋混凝土板厚不应小于100mm",
    category: "结构规范",
    severity: "warning",
    targetType: "IFCSLAB",
    property: "depth",
    operator: ">=",
    value: 100,
    unit: "mm",
    dsl: "IfcSlab.depth >= 100mm",
    enabled: true,
  },
]
