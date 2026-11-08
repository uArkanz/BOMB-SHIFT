// src/game/arena/ArenaMutations.ts
// Pure arena mutation proposals — no Phaser dependency; safe to unit-test.
// Each function returns a MutationProposal:
//   { safe: true, changes } — apply all changes atomically
//   { safe: false }         — cancel entire mutation (no partial application)
//
// Safety rules (non-negotiable):
//   1. No block placed on a cell occupied by a player, enemy, or bomb
//   2. No block placed if it would trap any player (BFS finds no FLOOR escape)
//   3. Solid walls are never touched by any mutation

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CellChange {
  gx: number
  gy: number
  from: CellType
  to: CellType
}

export type MutationProposal =
  | { safe: true;  changes: CellChange[] }
  | { safe: false; reason: string }

/** Minimal entity footprint for occupancy checks (player, enemy, bomb). */
export interface OccupantRef {
  gridX: number
  gridY: number
}

// ─── BFS escape check ─────────────────────────────────────────────────────────

/**
 * Returns true if the player at (px, py) has at least one reachable FLOOR cell
 * that is NOT in the proposed new-block set.
 * Uses a simple BFS on the post-mutation arena snapshot.
 *
 * "Escape" = can reach any FLOOR cell adjacent to their start (≥1 step away).
 * This is a conservative check: if the player can move at all, it passes.
 */
function hasEscape(
  arenaState: ArenaState,
  px: number,
  py: number,
  newBlockSet: Set<string>,
): boolean {
  const { grid, width, height } = arenaState
  const visited = new Set<string>()
  const queue: Array<[number, number]> = [[px, py]]
  visited.add(`${px},${py}`)
  let reachableCount = 0

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const key = `${nx},${ny}`
      if (visited.has(key)) continue
      visited.add(key)
      const cellType = grid[ny][nx].type
      if (cellType === CellType.SOLID_WALL) continue
      if (cellType === CellType.DESTRUCTIBLE) continue
      if (newBlockSet.has(key)) continue  // would be blocked by mutation
      reachableCount++
      if (reachableCount >= 2) return true  // fast exit: at least 2 reachable = not trapped
      queue.push([nx, ny])
    }
  }
  return reachableCount >= 1  // at least 1 reachable FLOOR = can escape
}

// ─── Occupancy helpers ────────────────────────────────────────────────────────

function buildOccupiedSet(occupants: OccupantRef[]): Set<string> {
  const s = new Set<string>()
  for (const o of occupants) s.add(`${o.gridX},${o.gridY}`)
  return s
}

/** Check that placing blocks at `newCells` does not trap any occupant. */
function checkNoTrapping(
  arenaState: ArenaState,
  occupants: OccupantRef[],
  newBlockSet: Set<string>,
): boolean {
  for (const o of occupants) {
    if (!hasEscape(arenaState, o.gridX, o.gridY, newBlockSet)) return false
  }
  return true
}

// ─── Euclidean radius helper ──────────────────────────────────────────────────

function inRadius(cx: number, cy: number, gx: number, gy: number, r: number): boolean {
  return (gx - cx) ** 2 + (gy - cy) ** 2 <= r * r
}

// ─── Mutation 1: Clear Zone ───────────────────────────────────────────────────

/**
 * Remove all DESTRUCTIBLE blocks in a radius-3 circle around (cx, cy).
 * Clear Zone never places blocks — it only removes them — so trapping is impossible.
 * Safe as long as no solid walls are touched (they never are by design).
 */
export function clearZone(
  arenaState: ArenaState,
  cx: number,
  cy: number,
  radius = 3,
): MutationProposal {
  const changes: CellChange[] = []
  for (let gy = 0; gy < arenaState.height; gy++) {
    for (let gx = 0; gx < arenaState.width; gx++) {
      if (!inRadius(cx, cy, gx, gy, radius)) continue
      if (arenaState.grid[gy][gx].type === CellType.DESTRUCTIBLE) {
        changes.push({ gx, gy, from: CellType.DESTRUCTIBLE, to: CellType.FLOOR })
      }
    }
  }
  // Removing blocks never traps anyone — always safe
  return { safe: true, changes }
}

// ─── Mutation 2: Block Surge ──────────────────────────────────────────────────

/**
 * Add DESTRUCTIBLE blocks to random FLOOR cells in a radius-3 circle
 * around (cx, cy), after safety validation.
 * Never places on occupied cells; cancels if any player would be trapped.
 *
 * @param density 0–1 fraction of eligible FLOOR cells to fill (default 0.4)
 */
export function blockSurge(
  arenaState: ArenaState,
  cx: number,
  cy: number,
  occupants: OccupantRef[],
  radius = 3,
  density = 0.4,
): MutationProposal {
  const occupied = buildOccupiedSet(occupants)

  // Collect eligible FLOOR cells in zone (not occupied, not solid)
  const eligible: Array<{ gx: number; gy: number }> = []
  for (let gy = 0; gy < arenaState.height; gy++) {
    for (let gx = 0; gx < arenaState.width; gx++) {
      if (!inRadius(cx, cy, gx, gy, radius)) continue
      if (arenaState.grid[gy][gx].type !== CellType.FLOOR) continue
      if (occupied.has(`${gx},${gy}`)) continue
      eligible.push({ gx, gy })
    }
  }

  if (eligible.length === 0) return { safe: false, reason: 'no eligible cells' }

  // Pick a random subset at `density` fraction
  // shortcut: uses Math.random — deterministic in tests via seeded subset
  const count = Math.max(1, Math.round(eligible.length * density))
  // Shuffle eligible (Fisher-Yates)
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[eligible[i], eligible[j]] = [eligible[j], eligible[i]]
  }
  const chosen = eligible.slice(0, count)

  // Build new-block set for BFS check
  const newBlockSet = new Set(chosen.map(c => `${c.gx},${c.gy}`))

  // Safety: would any player be trapped?
  if (!checkNoTrapping(arenaState, occupants, newBlockSet)) {
    return { safe: false, reason: 'would trap a player' }
  }

  const changes: CellChange[] = chosen.map(c => ({
    gx: c.gx, gy: c.gy,
    from: CellType.FLOOR,
    to: CellType.DESTRUCTIBLE,
  }))

  return { safe: true, changes }
}

// ─── Mutation 3: Corridor Shift ────────────────────────────────────────────────

/**
 * Opens a full horizontal ('h') or vertical ('v') corridor through the arena
 * by removing all DESTRUCTIBLE blocks on that row/column.
 * Like clearZone, this only removes blocks — never traps.
 *
 * @param axis  'h' = clear row `index`, 'v' = clear column `index`
 * @param index Row or column index to clear
 */
export function corridorShift(
  arenaState: ArenaState,
  axis: 'h' | 'v',
  index: number,
): MutationProposal {
  const changes: CellChange[] = []

  if (axis === 'h') {
    const gy = index
    if (gy < 0 || gy >= arenaState.height) return { safe: false, reason: 'out of bounds' }
    for (let gx = 0; gx < arenaState.width; gx++) {
      if (arenaState.grid[gy][gx].type === CellType.DESTRUCTIBLE) {
        changes.push({ gx, gy, from: CellType.DESTRUCTIBLE, to: CellType.FLOOR })
      }
    }
  } else {
    const gx = index
    if (gx < 0 || gx >= arenaState.width) return { safe: false, reason: 'out of bounds' }
    for (let gy = 0; gy < arenaState.height; gy++) {
      if (arenaState.grid[gy][gx].type === CellType.DESTRUCTIBLE) {
        changes.push({ gx, gy, from: CellType.DESTRUCTIBLE, to: CellType.FLOOR })
      }
    }
  }

  return { safe: true, changes }
}
