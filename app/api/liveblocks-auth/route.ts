import { Liveblocks } from "@liveblocks/node"
import { auth } from "@/lib/auth"
import { getColorForIndex } from "@/lib/collaboration/types"

export async function POST() {
  if (!process.env.LIVEBLOCKS_SECRET_KEY) {
    return new Response("Liveblocks not configured", { status: 503 })
  }

  const liveblocks = new Liveblocks({
    secret: process.env.LIVEBLOCKS_SECRET_KEY,
  })

  const session = await auth()

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const userId = session.user.id
  const userName = session.user.name || session.user.email?.split("@")[0] || "Anonymous"
  const userEmail = session.user.email || ""
  const colorIndex = Math.abs(hashCode(userId)) % 12

  const liveblocksSession = liveblocks.prepareSession(userId, {
    userInfo: {
      name: userName,
      email: userEmail,
      color: getColorForIndex(colorIndex),
    },
  })

  // Allow access to all model rooms (prefix: "model:")
  liveblocksSession.allow("model:*", liveblocksSession.FULL_ACCESS)

  const { body, status } = await liveblocksSession.authorize()
  return new Response(body, { status })
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}
