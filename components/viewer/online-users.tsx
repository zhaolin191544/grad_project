"use client"

import type { CollabUser } from "@/lib/collaboration/types"
import { cn } from "@/lib/utils"

interface OnlineUsersProps {
  users: CollabUser[]
  currentUserId: string
  connected: boolean
}

export function OnlineUsers({ users, currentUserId, connected }: OnlineUsersProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Connection indicator */}
      <div
        className={cn(
          "h-2 w-2 rounded-full mr-1",
          connected ? "bg-green-500" : "bg-red-500"
        )}
        title={connected ? "Connected" : "Disconnected"}
      />

      {/* User avatars */}
      <div className="flex -space-x-2">
        {users.map((user) => (
          <div
            key={user.id}
            className={cn(
              "relative h-7 w-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white",
              user.id === currentUserId && "ring-2 ring-primary ring-offset-1"
            )}
            style={{
              backgroundColor: user.color,
              borderColor: "var(--background)",
            }}
            title={user.id === currentUserId ? `${user.name} (you)` : user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}
      </div>

      {users.length > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          {users.length}
        </span>
      )}
    </div>
  )
}
