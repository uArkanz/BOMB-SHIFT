// src/game/ai/Pathfinder.ts
// BFS pathfinder on the 13×13 grid.
// Pure — no Phaser dependency; safe to unit-test.

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]] as const

/**
 * BFS from (fromX, fromY) to (toX, toY) on the arena grid.
 * Returns the path as [{gx,gy},...] from start (exclusive) to goal (inclusive),
 * or null if the goal is unreachable.
 *
 * @param excludeCells  Optional set of "gx,gy" keys to treat as impassable
 *                      (used by Chaser/Tactician to avoid DangerMap cells).
 */
export function findPath(
  arena: ArenaState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  excludeCells: ReadonlySet<string> = new Set(),
): Array<{ gx: number; gy: number }> | null {
  if (fromX === toX && fromY === toY) return []

  const { grid, width, height } = arena
  const visited = new Set<string>()
  const parent = new Map<string, string | null>()
  const startKey = `${fromX},${fromY}`
  const goalKey  = `${toX},${toY}`

  visited.add(startKey)
  parent.set(startKey, null)
  const queue: Array<[number, number]> = [[fromX, fromY]]

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const key = `${nx},${ny}`
      if (visited.has(key)) continue

      const cellType = grid[ny][nx].type
      if (cellType === CellType.SOLID_WALL) continue
      if (cellType === CellType.DESTRUCTIBLE) continue
      if (excludeCells.has(key)) continue

      visited.add(key)
      parent.set(key, `${cx},${cy}`)

      if (nx === toX && ny === toY) {
        // Reconstruct path (start-exclusive, goal-inclusive)
        const path: Array<{ gx: number; gy: number }> = []
        let cur: string | null = goalKey
        while (cur !== null && cur !== startKey) {
          const [gx, gy] = cur.split(',').map(Number)
          path.unshift({ gx, gy })
          cur = parent.get(cur) ?? null
        }
        return path
      }

      queue.push([nx, ny])
    }
  }

  return null  // unreachable
}

/**
 * Returns the Chebyshev distance between two grid cells.
 * Used for spawn-point distance checks.
 */
export function chebyshevDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}
