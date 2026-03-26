import OpenAI from "openai"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
})

const SYSTEM_PROMPT = `你是一个 BIM 合规性检查规则生成助手。用户会用自然语言描述建筑规范要求，你需要将其转换为 DSL 规则。

## DSL 语法
格式: IFC类型.属性 运算符 值单位

### 支持的 IFC 类型
- IfcDoor (门)
- IfcWindow (窗)
- IfcWall (墙)
- IfcSlab (楼板)
- IfcBeam (梁)
- IfcColumn (柱)
- IfcStairFlight (楼梯段)
- IfcSpace (空间)
- IfcRoof (屋顶)

### 支持的属性
- height / overallHeight (高度)
- width / overallWidth (宽度)
- depth / overallDepth (深度/厚度)
- area (面积)
- volume (体积)
- fireRating (防火等级)
- riserHeight (踏步高度)
- treadLength (踏面宽度)
- name (名称)
- objectType (对象类型)

### 支持的运算符
==, !=, >=, <=, >, <, contains, exists

### 支持的单位
mm, cm, m, m2, m3

## 输出格式
对于每条规则，返回如下 JSON 数组（可包含多条规则）：
\`\`\`json
[
  {
    "name": "规则名称",
    "description": "规则描述",
    "category": "分类（门窗规范/楼梯规范/通道规范/空间规范/消防规范/结构规范/自定义规则）",
    "severity": "error 或 warning 或 info",
    "dsl": "IfcDoor.height >= 2100mm"
  }
]
\`\`\`

## 注意
- 只输出 JSON，不要添加其他说明文字
- 确保 DSL 语法正确
- 根据中国建筑规范（GB标准）合理设置阈值
- severity: 安全相关用 error，舒适性用 warning，建议性用 info`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { prompt } = await req.json()
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    })

    const content = completion.choices[0]?.message?.content || "[]"

    // Extract JSON from the response
    let rules
    try {
      // Try to parse directly
      rules = JSON.parse(content)
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        rules = JSON.parse(jsonMatch[1].trim())
      } else {
        rules = []
      }
    }

    return NextResponse.json({ rules })
  } catch (error) {
    console.error("Compliance AI error:", error)
    return NextResponse.json(
      { error: "Failed to generate rules" },
      { status: 500 }
    )
  }
}
