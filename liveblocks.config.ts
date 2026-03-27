import { createClient, LiveList } from "@liveblocks/client"
import { createRoomContext } from "@liveblocks/react"

const client = createClient({
  authEndpoint: "/api/liveblocks-auth",
})

// Presence: per-user ephemeral state (cursors, selections)
export type Presence = {
  cursor: {
    x: number
    y: number
    worldX?: number
    worldY?: number
    worldZ?: number
  } | null
  selectedExpressID: number | null
}

// Storage: persistent shared state
export type Storage = {
  annotations: LiveList<Annotation>
}

export type Annotation = {
  id: string
  userId: string
  userName: string
  userColor: string
  elementId?: string
  content: string
  position?: { x: number; y: number; z: number }
  createdAt: string
}

// User metadata resolved by auth endpoint
export type UserMeta = {
  id: string
  info: {
    name: string
    email: string
    color: string
  }
}

// Broadcast event types
export type RoomEvent =
  | { type: "annotation"; annotation: Annotation }

export const {
  RoomProvider,
  useMyPresence,
  useUpdateMyPresence,
  useOthers,
  useSelf,
  useBroadcastEvent,
  useEventListener,
  useOthersMapped,
  useStorage,
  useMutation,
} = createRoomContext<Presence, Storage, UserMeta, RoomEvent>(client)
