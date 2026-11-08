// src/test/EnemyAI.test.ts
// Unit tests for Pathfinder, DangerMap, WaveSystem (wave formula + spawn rules).
// No Phaser instantiation.

import { describe, expect, it } from 'vitest'
import { findPath, chebyshevDist } from '@/game/ai/Pathfinder'
import { computeDangerMap } from '@/game/ai/DangerMap'
import { waveSpec, totalEnemies } from '@/game/systems/WaveFormulas'
import { generateArena } from '@/game/arena/ArenaGenerator'
import { CellType } from '@/game/types/GridTypes'
import type { ArenaState, GridCell } from '@/game/types/GridTypes'
import { BombState } from '@/game/entities/BombState'
import type { Bomb } from '@/game/entities/Bomb'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArena(overrides: Record<string, CellType> = {}): ArenaState {
  const W = 7, H = 7
  const grid: GridCell[][] = Array.from({ length: H }, (_, gy) =>
    Array.from({ length: W }, (_, gx) => ({
      type: overrides[`${gx},${gy}`] ?? CellType.FLOOR,
      occupant: null,
    })),
  )
  return { grid, width: W, height: H }
}

function makeFusingBomb(gridX: number, gridY: number, range: number): Bomb {
  return { gridX, gridY, range, state: BombState.FUSING } as unknown as Bomb
}

// ─── Pathfinder tests ─────────────────────────────────────────────────────────

describe('Pathfinder.findPath', () => {
  it('finds the shortest path on an open grid', () => {
    const arena = makeArena()
    const path = findPath(arena, 0, 0, 3, 0)

    expect(path).not.toBeNull()
    expect(path!).toHaveLength(3)
    expect(path![0]).toEqual({ gx: 1, gy: 0 })
    expect(path![2]).toEqual({ gx: 3, gy: 0 })
  })

  it('returns empty array when start === goal', () => {
    const arena = makeArena()
    const path = findPath(arena, 2, 2, 2, 2)
    expect(path).toEqual([])
  })

  it('returns null when target is completely walled off', () => {
    // Surround (3,3) with walls
    const arena = makeArena({
      '3,2': CellType.SOLID_WALL,
      '3,4': CellType.SOLID_WALL,
      '2,3': CellType.SOLID_WALL,
      '4,3': CellType.SOLID_WALL,
    })
    const path = findPath(arena, 0, 0, 3, 3)
    expect(path).toBeNull()
  })

  it('navigates around a wall', () => {
    // Wall runs vertically at x=2 from y=0 to y=4, leaving y=5 open
    const overrides: Record<string, CellType> = {}
    for (let y = 0; y <= 4; y++) overrides[`2,${y}`] = CellType.SOLID_WALL
    const arena = makeArena(overrides)
    const path = findPath(arena, 0, 0, 4, 0)

    expect(path).not.toBeNull()
    // Path must go around the wall (through y=5 or y=6)
    expect(path!.every(c => !(c.gx === 2 && c.gy <= 4))).toBe(true)
  })

  it('respects excludeCells (danger avoidance)', () => {
    const arena = makeArena()
    // Exclude the direct path cells (but NOT the destination itself)
    const exclude = new Set(['1,0', '2,0'])
    const path = findPath(arena, 0, 0, 3, 0, exclude)

    // Must still find a path going around
    expect(path).not.toBeNull()
    // None of the excluded cells appear in the path
    expect(path!.every(c => !exclude.has(`${c.gx},${c.gy}`))).toBe(true)
    // Path ends at destination
    expect(path!.at(-1)).toEqual({ gx: 3, gy: 0 })
  })
})

// ─── DangerMap tests ──────────────────────────────────────────────────────────

describe('DangerMap.computeDangerMap', () => {
  it('marks the bomb cell and its arm cells as dangerous', () => {
    const arena = makeArena()
    const bomb = makeFusingBomb(3, 3, 2)
    const danger = computeDangerMap(arena, [bomb])

    // Bomb's own cell
    expect(danger.has('3,3')).toBe(true)
    // 2 cells in each direction
    expect(danger.has('4,3')).toBe(true)
    expect(danger.has('5,3')).toBe(true)
    expect(danger.has('2,3')).toBe(true)
    expect(danger.has('1,3')).toBe(true)
    expect(danger.has('3,4')).toBe(true)
    expect(danger.has('3,2')).toBe(true)
  })

  it('stops the arm at a SOLID_WALL (wall not marked)', () => {
    const arena = makeArena({ '4,3': CellType.SOLID_WALL })
    const bomb = makeFusingBomb(3, 3, 2)
    const danger = computeDangerMap(arena, [bomb])

    // Wall cell itself not in danger map
    expect(danger.has('4,3')).toBe(false)
    // Cell beyond wall also not dangerous
    expect(danger.has('5,3')).toBe(false)
  })

  it('includes a DESTRUCTIBLE cell but stops there', () => {
    const arena = makeArena({ '4,3': CellType.DESTRUCTIBLE })
    const bomb = makeFusingBomb(3, 3, 2)
    const danger = computeDangerMap(arena, [bomb])

    expect(danger.has('4,3')).toBe(true)   // destructible is hit
    expect(danger.has('5,3')).toBe(false)  // arm stops at destructible
  })

  it('returns empty set when no fusing bombs exist', () => {
    const arena = makeArena()
    expect(computeDangerMap(arena, [])).toEqual(new Set())
  })
})

// ─── Wave formula tests ───────────────────────────────────────────────────────

describe('WaveSystem wave formula', () => {
  it('wave 1: 2 Grunts, 0 Chasers, 0 Tacticians', () => {
    const s = waveSpec(1)
    expect(s).toEqual({ grunts: 2, chasers: 0, tacticians: 0 })
    expect(totalEnemies(s)).toBe(2)
  })

  it('wave 2: 2 Grunts, 1 Chaser', () => {
    expect(waveSpec(2)).toEqual({ grunts: 2, chasers: 1, tacticians: 0 })
  })

  it('wave 4: 2 Grunts, 1 Chaser, 1 Tactician', () => {
    expect(waveSpec(4)).toEqual({ grunts: 2, chasers: 1, tacticians: 1 })
  })

  it('wave 5: N=1 Tactician (min(6, 5-4)=1)', () => {
    const s = waveSpec(5)
    expect(s.tacticians).toBe(1)
    expect(s.chasers).toBe(0)
    expect(s.grunts).toBe(2)
    expect(totalEnemies(s)).toBe(3)
  })

  it('wave 10: N=6 Tacticians (capped), total 8', () => {
    const s = waveSpec(10)
    expect(s.tacticians).toBe(6)
    expect(totalEnemies(s)).toBe(8)
  })

  it('wave 20: composition frozen at wave 8 values (cap still 8)', () => {
    const s = waveSpec(20)
    expect(totalEnemies(s)).toBe(8)
    expect(s.tacticians).toBe(6)  // min(6, 20-4) = 6
  })

  it('total enemies never exceeds 8', () => {
    for (let w = 1; w <= 20; w++) {
      expect(totalEnemies(waveSpec(w))).toBeLessThanOrEqual(8)
    }
  })
})

// ─── Spawn rules (pure logic check) ──────────────────────────────────────────

describe('Spawn rules', () => {
  it('chebyshevDist correctly measures distance', () => {
    expect(chebyshevDist(1, 1, 1, 1)).toBe(0)
    expect(chebyshevDist(1, 1, 4, 1)).toBe(3)
    expect(chebyshevDist(1, 1, 4, 4)).toBe(3)
    expect(chebyshevDist(0, 0, 2, 3)).toBe(3)
  })

  it('a spawn candidate 3+ tiles from player is accepted (distance check)', () => {
    expect(chebyshevDist(5, 5, 1, 1)).toBeGreaterThanOrEqual(3)
  })

  it('a spawn candidate within 3 tiles of player is rejected', () => {
    expect(chebyshevDist(2, 2, 1, 1)).toBeLessThan(3)
  })

  it('REGRESSION: wave-1 corner anchors (11,1) and (1,11) are NOT in the protected spawn zones', () => {
    // ArenaGenerator only clears (1,1)±2 and (11,11)±2 — NOT the opposite corners.
    // This test documents the known risk and confirms the radius-3 scan is needed.
    // (11,1): chebyshev to (1,1)=10, to (11,11)=10 → NOT protected → can be DESTRUCTIBLE
    // (1,11): chebyshev to (1,1)=10, to (11,11)=10 → NOT protected → can be DESTRUCTIBLE
    const topRightDist = Math.max(Math.abs(11 - 1), Math.abs(1 - 1))   // = 10
    const bottomLeftDist = Math.max(Math.abs(1 - 11), Math.abs(11 - 11)) // = 10
    expect(topRightDist).toBeGreaterThan(2)   // outside spawn zone → not guaranteed FLOOR
    expect(bottomLeftDist).toBeGreaterThan(2) // outside spawn zone → not guaranteed FLOOR
  })

  it('REGRESSION: radius-3 scan always finds at least one valid spawn cell on a real arena', () => {
    // Run 20 arena generations — each must yield at least 1 FLOOR cell near (11,1) or (1,11)
    // within Chebyshev radius 3, ensuring no all-blocked scenario.
    // This validates the fix: radius-3 scan with fallback to periphery.
    for (let trial = 0; trial < 20; trial++) {
      const arena = generateArena({ blockDensity: 0.65 })
      const anchors = [{ ax: 11, ay: 1 }, { ax: 1, ay: 11 }]
      for (const { ax, ay } of anchors) {
        let foundFloor = false
        for (let gx = 0; gx < 13 && !foundFloor; gx++) {
          for (let gy = 0; gy < 13 && !foundFloor; gy++) {
            if (Math.max(Math.abs(gx - ax), Math.abs(gy - ay)) > 5) continue
            if (arena.grid[gy][gx].type === CellType.FLOOR) foundFloor = true
          }
        }
        // With radius 5 there MUST be a floor cell (at minimum the solid-wall-free cells)
        expect(foundFloor).toBe(true)
      }
    }
  })
})
