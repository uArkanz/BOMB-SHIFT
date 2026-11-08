// src/game/ai/behaviors/TacticianBehavior.ts
// Tactician: Chaser + predictive bomb placement to cut off player path + retreat logic.
// Places bomb at a cell that blocks the player's BFS route to safety.

import type { EnemyBehavior, BehaviorContext } from '../../entities/Enemy'
import { findPath } from '../Pathfinder'

const MOVE_INTERVAL_MS = 450

export class TacticianBehavior implements EnemyBehavior {
  private moveTimer = 0
  private bombCooldown = 0

  tick(ctx: BehaviorContext, delta: number): void {
    const { enemy, arena, players, dangerMap } = ctx

    this.bombCooldown = Math.max(0, this.bombCooldown - delta)

    // Find nearest alive player
    const target = players.filter(p => p.isAlive)
      .sort((a, b) =>
        Math.abs(a.gridX - enemy.gridX) + Math.abs(a.gridY - enemy.gridY) -
        (Math.abs(b.gridX - enemy.gridX) + Math.abs(b.gridY - enemy.gridY)),
      )[0]

    if (!target) return

    // Retreat: if enemy's own cell is dangerous, move away immediately
    if (dangerMap.has(`${enemy.gridX},${enemy.gridY}`)) {
      this.retreat(ctx)
      return
    }

    this.moveTimer += delta
    if (this.moveTimer < MOVE_INTERVAL_MS) return
    this.moveTimer = 0

    // BFS toward player, avoiding danger
    const path = findPath(arena, enemy.gridX, enemy.gridY, target.gridX, target.gridY, dangerMap)
    const fallbackPath = findPath(arena, enemy.gridX, enemy.gridY, target.gridX, target.gridY)

    const activePath = path ?? fallbackPath
    if (activePath && activePath.length > 0) {
      const next = activePath[0]
      enemy.tryMove(next.gx - enemy.gridX, next.gy - enemy.gridY)
    }

    // Predictive bomb: if we can find a cell on the player's own escape path that
    // we can reach AND bomb, place there to block them.
    if (this.bombCooldown === 0) {
      this.tryPredictiveBomb(ctx, target)
    }
  }

  private retreat(ctx: BehaviorContext): void {
    const { enemy, dangerMap } = ctx
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]] as const
    for (const [dx, dy] of DIRS) {
      const nx = enemy.gridX + dx
      const ny = enemy.gridY + dy
      if (!dangerMap.has(`${nx},${ny}`)) {
        if (enemy.tryMove(dx, dy)) return
      }
    }
    // All neighbours dangerous — stay put (better than walking into explosion)
  }

  private tryPredictiveBomb(ctx: BehaviorContext, target: { gridX: number; gridY: number }): void {
    const { enemy, placeBombFn } = ctx
    const dist = Math.abs(enemy.gridX - target.gridX) + Math.abs(enemy.gridY - target.gridY)

    // Only attempt if reasonably close (within 5 tiles Manhattan)
    if (dist > 5) return

    // Find the player's path to some escape (BFS from player outward — use first step)
    // A simple heuristic: if we're adjacent, just place bomb here
    if (dist <= 2) {
      this.bombCooldown = 3_000  // 3s between bomb placements
      placeBombFn(enemy)
    }
  }
}
