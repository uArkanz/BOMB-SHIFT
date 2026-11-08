// src/game/ai/behaviors/ChaserBehavior.ts
// Chaser: BFS toward nearest player, avoids DangerMap cells.
// Places bomb when adjacent to player.

import type { EnemyBehavior, BehaviorContext } from '../../entities/Enemy'
import { findPath } from '../Pathfinder'

const MOVE_INTERVAL_MS = 500

export class ChaserBehavior implements EnemyBehavior {
  private moveTimer = 0

  tick(ctx: BehaviorContext, delta: number): void {
    const { enemy, arena, players, dangerMap } = ctx

    // Find nearest alive player
    const target = players
      .filter(p => p.isAlive)
      .sort((a, b) =>
        Math.abs(a.gridX - enemy.gridX) + Math.abs(a.gridY - enemy.gridY) -
        (Math.abs(b.gridX - enemy.gridX) + Math.abs(b.gridY - enemy.gridY)),
      )[0]

    if (!target) return

    this.moveTimer += delta
    if (this.moveTimer < MOVE_INTERVAL_MS) return
    this.moveTimer = 0

    // BFS excluding danger cells (except enemy's own cell)
    const path = findPath(arena, enemy.gridX, enemy.gridY, target.gridX, target.gridY, dangerMap)

    if (path && path.length > 0) {
      const next = path[0]
      const dx = next.gx - enemy.gridX
      const dy = next.gy - enemy.gridY
      enemy.tryMove(dx, dy)
    } else {
      // Danger-avoiding path failed — try without avoidance (fallback)
      const fallback = findPath(arena, enemy.gridX, enemy.gridY, target.gridX, target.gridY)
      if (fallback && fallback.length > 0) {
        const next = fallback[0]
        enemy.tryMove(next.gx - enemy.gridX, next.gy - enemy.gridY)
      }
    }

    // Place bomb when adjacent to player
    const dist = Math.abs(enemy.gridX - target.gridX) + Math.abs(enemy.gridY - target.gridY)
    if (dist === 1) {
      ctx.placeBombFn(enemy)
    }
  }
}
