"use client"

import { ReactNode, useState, useEffect, createContext, useContext } from "react"
import { RoomProvider } from "@/liveblocks.config"
import { LiveList } from "@liveblocks/client"

// Context to tell hooks whether Liveblocks is active
export const LiveblocksActiveContext = createContext(false)
export function useLiveblocksActive() {
  return useContext(LiveblocksActiveContext)
}

interface CollaborationRoomProps {
  modelId: string
  children: ReactNode
}

export function CollaborationRoom({ modelId, children }: CollaborationRoomProps) {
  const [liveblocksReady, setLiveblocksReady] = useState(false)

  // Check if Liveblocks is configured by probing the auth endpoint
  useEffect(() => {
    fetch("/api/liveblocks-auth", { method: "POST" })
      .then((res) => {
        // 503 = not configured, anything else = configured
        setLiveblocksReady(res.status !== 503)
      })
      .catch(() => setLiveblocksReady(false))
  }, [])

  if (!liveblocksReady) {
    return (
      <LiveblocksActiveContext.Provider key="inactive" value={false}>
        {children}
      </LiveblocksActiveContext.Provider>
    )
  }

  return (
    <LiveblocksActiveContext.Provider key="active" value={true}>
      <RoomProvider
        id={`model:${modelId}`}
        initialPresence={{
          cursor: null,
          selectedExpressID: null,
        }}
        initialStorage={{
          annotations: new LiveList([]),
        }}
      >
        {children}
      </RoomProvider>
    </LiveblocksActiveContext.Provider>
  )
}
