import OpenAI from "openai"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
})

const SYSTEM_PROMPT = `You are an intelligent BIM (Building Information Modeling) assistant integrated into an IFC model viewer platform. You help users analyze and understand their IFC building models.

You have access to the following model context data provided by the system. Use it to answer questions about the building structure, components, properties, etc.

## Capabilities
1. **Model Q&A**: Answer questions about the building (floors, components, areas, etc.)
2. **View Commands**: When the user asks to change the view or highlight elements, return a JSON command block that the frontend will execute.

## View Command Format
When the user requests a view action, include a command block in your response using this exact format:
\`\`\`command
{"action": "ACTION_NAME", "params": {...}}
\`\`\`

Available actions:
- \`{"action": "highlightByType", "params": {"type": "IFCWALL"}}\` — Highlight all elements of a given IFC type
- \`{"action": "setView", "params": {"view": "top"}}\` — Set preset view: "top", "front", or "iso"
- \`{"action": "toggleWireframe", "params": {"enabled": true}}\` — Toggle wireframe mode
- \`{"action": "toggleXRay", "params": {"enabled": true}}\` — Toggle X-Ray mode
- \`{"action": "toggleClipping", "params": {"enabled": true, "height": 3.0}}\` — Toggle section plane
- \`{"action": "highlightElement", "params": {"expressID": 123}}\` — Highlight a specific element by expressID
- \`{"action": "resetView", "params": {}}\` — Reset to default view

## Response Guidelines
- Answer in the same language the user uses (Chinese/English)
- Be concise and precise
- When referencing specific building data, cite the source (e.g., "According to the model's spatial structure...")
- For numerical questions, provide calculations when possible
- You can include multiple command blocks in one response if needed
`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    })
  }

  const { messages, modelContext, modelId } = await req.json()

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Invalid messages" }), {
      status: 400,
    })
  }

  // Build context message from model data
  let contextMessage = ""
  if (modelContext) {
    contextMessage = `\n## Current Model Context\n`
    if (modelContext.fileName) {
      contextMessage += `- **File**: ${modelContext.fileName}\n`
    }
    if (modelContext.stats) {
      contextMessage += `- **Total Elements**: ${modelContext.stats.elementCount}\n`
      contextMessage += `- **Floors**: ${modelContext.stats.levelCount}\n`
    }
    if (modelContext.spatialTree) {
      contextMessage += `\n### Spatial Structure\n\`\`\`json\n${JSON.stringify(modelContext.spatialTree, null, 2)}\n\`\`\`\n`
    }
    if (modelContext.elementSummary) {
      contextMessage += `\n### Element Summary by Type\n\`\`\`json\n${JSON.stringify(modelContext.elementSummary, null, 2)}\n\`\`\`\n`
    }
    if (modelContext.elementList) {
      contextMessage += `\n### Element List (first 200)\n\`\`\`json\n${JSON.stringify(modelContext.elementList.slice(0, 200), null, 2)}\n\`\`\`\n`
    }
  }

  // Format messages for DeepSeek API (OpenAI-compatible)
  const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT + contextMessage },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ]

  // Save user message to DB
  const lastUserMsg = messages[messages.length - 1]
  if (lastUserMsg?.role === "user" && modelId) {
    await db.chatHistory.create({
      data: {
        modelId,
        userId: session.user.id,
        role: "user",
        content: lastUserMsg.content,
      },
    })
  }

  // Create streaming response
  let stream
  try {
    stream = await client.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 4096,
      stream: true,
      messages: apiMessages,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error"
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Collect full response for DB save
  let fullResponse = ""

  const encoder = new TextEncoder()
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content
          if (text) {
            fullResponse += text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
            )
          }
        }

        // Send done signal
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
        controller.close()

        // Save assistant response to DB
        if (modelId) {
          await db.chatHistory.create({
            data: {
              modelId,
              userId: session.user!.id!,
              role: "assistant",
              content: fullResponse,
            },
          })
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error"
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: errorMessage })}\n\n`
          )
        )
        controller.close()
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

// GET: Load chat history for a model
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    })
  }

  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get("modelId")

  if (!modelId) {
    return new Response(JSON.stringify({ error: "modelId required" }), {
      status: 400,
    })
  }

  const history = await db.chatHistory.findMany({
    where: { modelId, userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  })

  return new Response(JSON.stringify(history))
}
