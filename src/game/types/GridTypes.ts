// src/game/types/GridTypes.ts
// Grid data types — implemented in ST-04.
// Note: TypeScript 7 with erasableSyntaxOnly requires const objects instead of enums.

export const CellType = {
  FLOOR: 'FLOOR',
  SOLID_WALL: 'SOLID_WALL',
  DESTRUCTIBLE: 'DESTRUCTIBLE',
} as const
export type CellType = (typeof CellType)[keyof typeof CellType]

export const EntityType = {
  PLAYER: 'PLAYER',
  ENEMY: 'ENEMY',
  BOMB: 'BOMB',
} as const
export type EntityType = (typeof EntityType)[keyof typeof EntityType]

export interface GridCell {
  type: CellType
  occupant: EntityType | null
}

export interface ArenaState {
  grid: GridCell[][]
  width: number
  height: number
}
