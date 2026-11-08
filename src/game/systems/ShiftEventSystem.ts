// src/game/systems/ShiftEventSystem.ts
// Fires arena mutation events every 20 seconds.
// Selects a random mutation type, validates safety, applies atomically, plays VFX.
// "Enemies" parameter is empty in ST-08 (populated in ST-09).

import Phaser from 'phaser'
import { clearZone, blockSurge, corridorShift } from '../arena/ArenaMutations'
import type { OccupantRef } from '../arena/ArenaMutations'
import { ShiftEventVFX } from '../vfx/ShiftEventVFX'
import { GameEventBus, GameEvents } from '../GameEventBus'
import type { ArenaState } from '../types/GridTypes'
import type { GameScene } from '../scenes/GameScene'
import { GRID_COLS, GRID_ROWS } from '../constants'

// Mutation type indices
const MUTATION_COUNT = 3

export class ShiftEventSystem {
  private readonly scene: Phaser.Scene
  private readonly gameScene: GameScene
  private readonly vfx: ShiftEventVFX
  private timer: Phaser.Time.TimerEvent | null = null

  /** Configurable interval — default 20 000 ms */
  readonly intervalMs: number

  constructor(
    scene: Phaser.Scene,
    gameScene: GameScene,
    intervalMs = 20_000,
  ) {
    this.scene = scene
    this.gameScene = gameScene
    this.intervalMs = intervalMs
    this.vfx = new ShiftEventVFX(scene)
  }

  /** Start the repeating timer. Call from GameScene.create(). */
  start(arenaState: ArenaState, getOccupants: () => OccupantRef[]): void {
    this.timer = this.scene.time.addEvent({
      delay: this.intervalMs,
      loop: true,
      callback: () => this.tick(arenaState, getOccupants()),
    })
  }

  /** Stop and destroy the timer. Call from scene shutdown. */
  shutdown(): void {
    this.timer?.destroy()
    this.timer = null
  }

  // ── Mutation tick ────────────────────────────────────────────────────────────

  private tick(arenaState: ArenaState, occupants: OccupantRef[]): void {
    // Pick random interior point (avoid outer wall ring: rows/cols 1..N-2)
    const cx = Phaser.Math.Between(2, GRID_COLS - 3)
    const cy = Phaser.Math.Between(2, GRID_ROWS - 3)

    // Pick mutation type randomly
    const type = Phaser.Math.Between(0, MUTATION_COUNT - 1)
    let proposal

    switch (type) {
      case 0:
        proposal = clearZone(arenaState, cx, cy, 3)
        break
      case 1:
        proposal = blockSurge(arenaState, cx, cy, occupants, 3, 0.4)
        break
      case 2: {
        const axis = Math.random() < 0.5 ? 'h' : 'v' as 'h' | 'v'
        const index = axis === 'h'
          ? Phaser.Math.Between(2, GRID_ROWS - 3)
          : Phaser.Math.Between(2, GRID_COLS - 3)
        proposal = corridorShift(arenaState, axis, index)
        break
      }
      default:
        return
    }

    // Cancel if unsafe
    if (!proposal.safe) return

    const { changes } = proposal
    if (changes.length === 0) return  // nothing to do (e.g. zone already clear)

    // Apply changes atomically to arena + scene
    for (const c of changes) {
      this.gameScene.updateCell(c.gx, c.gy, c.to)
    }

    // VFX — plays after tiles are updated
    this.vfx.play(changes)

    // Notify HUD / other systems
    GameEventBus.emit(GameEvents.ARENA_SHIFT_EVENT, { mutationType: ['clearZone', 'blockSurge', 'corridorShift'][type] })
  }
}
