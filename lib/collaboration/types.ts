// Collaboration types (shared between components)

export interface CollabUser {
  id: string
  name: string
  email: string
  color: string
}

export interface CursorPosition {
  x: number
  y: number
  worldX?: number
  worldY?: number
  worldZ?: number
}

export interface CollabAnnotation {
  id: string
  userId: string
  userName: string
  userColor: string
  elementId?: string
  content: string
  position?: { x: number; y: number; z: number }
  createdAt: string
}

// Predefined user colors for collaboration
export const COLLAB_COLORS = [
  "#F44336", "#E91E63", "#9C27B0", "#673AB7",
  "#3F51B5", "#2196F3", "#00BCD4", "#009688",
  "#4CAF50", "#FF9800", "#FF5722", "#795548",
]

export function getColorForIndex(index: number): string {
  return COLLAB_COLORS[index % COLLAB_COLORS.length]
}
