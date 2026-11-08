// src/game/systems/WaveSystem.ts
// Manages solo-mode wave progression: spawning, scoring, and game-over.
// Follows the canonical wave table and formula from bombshift-plan.md ST-09.

import Phaser from 'phaser'
import { Enemy, EnemyTier } from '../entities/Enemy'
import { GruntBehavior } from '../ai/behaviors/GruntBehavior'
import { ChaserBehavior } from '../ai/behaviors/ChaserBehavior'
import { TacticianBehavior } from '../ai/behaviors/TacticianBehavior'
import { computeDangerMap } from '../ai/DangerMap'
import { chebyshevDist } from '../ai/Pathfinder'
import { isCellPassable } from '../utils/collisions'
import { GameEventBus, GameEvents } from '../GameEventBus'
import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'
import type { Player } from '../entities/Player'
import type { Bomb } from '../entities/Bomb'
import type { BehaviorContext } from '../entities/Enemy'
import { GRID_COLS, GRID_ROWS } from '../constants'
import { waveSpec, killScore, waveClearBonus, timeBonus } from './WaveFormulas'
export { waveSpec, totalEnemies, killScore, waveClearBonus, timeBonus } from './WaveFormulas'

// ─── WaveSystem ───────────────────────────────────────────────────────────────

export class WaveSystem {
  private readonly scene: Phaser.Scene
  // gameScene: reserved for ST-10 direct scene calls
  private readonly arenaState: ArenaState
  private readonly getPlayers: () => readonly Player[]
  private readonly getBombs: () => readonly Bomb[]
  private readonly placeBombForEnemy: (e: Enemy) => void

  private enemies: Enemy[] = []
  private waveNumber = 0
  private score = 0
  private kills = 0
  private waveStartTime = 0
  // Per-wave accumulators (parallel arrays — all same length after each endWave())
  private waveDurations: number[] = []    // seconds (rounded) per completed wave
  private waveNumbers: number[] = []      // 1-based wave index per completed wave
  private killsPerWave: number[] = []     // kills per completed wave slot
  private currentWaveKills = 0           // kills in the wave in progress
  private betweenWaves = false
  private gameOverEmitted = false

  constructor(
    scene: Phaser.Scene,
    _gameScene: unknown,  // GameScene — reserved for ST-10
    arenaState: ArenaState,
    getPlayers: () => readonly Player[],
    getBombs:   () => readonly Bomb[],
    placeBombForEnemy: (e: Enemy) => void,
  ) {
    this.scene = scene
    void _gameScene  // not used until ST-10
    this.arenaState = arenaState
    this.getPlayers = getPlayers
    this.getBombs   = getBombs
    this.placeBombForEnemy = placeBombForEnemy
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  startWave(n: number): void {
    this.waveNumber = n
    this.waveStartTime = Date.now()  // wall clock
    this.betweenWaves = false
    this.currentWaveKills = 0

    const spec = waveSpec(n)
    const players = this.getPlayers()
    const enemyDefs: EnemyTier[] = [
      ...Array(spec.grunts).fill(EnemyTier.GRUNT),
      ...Array(spec.chasers).fill(EnemyTier.CHASER),
      ...Array(spec.tacticians).fill(EnemyTier.TACTICIAN),
    ].slice(0, 8) as EnemyTier[]

    this.enemies = []

    for (const tier of enemyDefs) {
      const pos = this.findSpawnCell(players)
      if (!pos) continue  // no valid cell — skip this enemy

      const behavior =
        tier === EnemyTier.GRUNT      ? new GruntBehavior() :
        tier === EnemyTier.CHASER     ? new ChaserBehavior() :
                                        new TacticianBehavior()

      const enemy = new Enemy(this.scene, tier, behavior, pos.gx, pos.gy)
      this.scene.add.existing(enemy as unknown as Phaser.GameObjects.GameObject)
      enemy.init(this.arenaState)
      this.enemies.push(enemy)
    }

    GameEventBus.emit(GameEvents.WAVE_START, {
      waveNumber: n,
      enemyCount: this.enemies.length,
    })
  }

  /** Called every frame from GameScene. */
  update(delta: number): void {
    if (this.betweenWaves) return

    const players = this.getPlayers()
    const bombs   = this.getBombs()
    const dangerMap = computeDangerMap(this.arenaState, bombs)
    const now = this.scene.time.now

    const ctx: Omit<BehaviorContext, 'enemy'> = {
      arena:      this.arenaState,
      players,
      allEnemies: this.enemies,
      bombs,
      dangerMap,
      placeBombFn: this.placeBombForEnemy,
      now,
    }

    for (const enemy of this.enemies) {
      enemy.update(delta, ctx)
    }

    // Check if player died → game over (guard: emit once only)
    const allPlayersDead = players.every(p => !p.isAlive)
    if (allPlayersDead && !this.gameOverEmitted) {
      this.gameOverEmitted = true
      this.emitGameOver(players)
      return
    }
    if (this.gameOverEmitted) return

    // Check wave clear
    if (this.enemies.length > 0 && this.enemies.every(e => !e.isAlive)) {
      this.endWave()
    }
  }

  get activeEnemies(): readonly Enemy[] {
    return this.enemies
  }

  shutdown(): void {
    for (const e of this.enemies) e.destroy()
    this.enemies = []
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private endWave(): void {
    if (this.betweenWaves) return
    this.betweenWaves = true

    const durationMs  = Date.now() - this.waveStartTime
    const durationSec = Math.round(durationMs / 1000)  // integer seconds — keeps score integer
    this.waveDurations.push(durationSec)                // store seconds, not ms
    this.waveNumbers.push(this.waveNumber)
    this.killsPerWave.push(this.currentWaveKills)
    this.currentWaveKills = 0

    const bonus = waveClearBonus(this.waveNumber) + timeBonus(durationSec)
    this.score += bonus  // bonus is now always an integer (integer inputs → integer output)

    GameEventBus.emit(GameEvents.WAVE_COMPLETE, {
      waveNumber: this.waveNumber,
      score: this.score,
    })

    // Start next wave after 3 s
    this.scene.time.delayedCall(3_000, () => {
      this.startWave(this.waveNumber + 1)
    })
  }

  private emitGameOver(_players: readonly Player[]): void {
    // waveDurations already in seconds (rounded in endWave)
    const completedWavesSec    = this.waveDurations.reduce((a, b) => a + b, 0)
    const currentWaveDurationSec = Math.round((Date.now() - this.waveStartTime) / 1000)
    const totalSec             = completedWavesSec + currentWaveDurationSec

    // Build killsPerWave: completed slots + extra slot for partial wave kills (if any)
    const killsPerWaveFull = [...this.killsPerWave]
    if (this.currentWaveKills > 0) {
      killsPerWaveFull.push(this.currentWaveKills)  // partial wave extra slot
    }

    GameEventBus.emit(GameEvents.GAME_OVER, {
      mode: 'solo',
      score: Math.round(this.score),   // guard: ensure integer even if float crept in
      wavesReached: this.waveNumbers.length,
      kills: this.kills,
      totalDurationSeconds: totalSec,
      waveDurations: [...this.waveDurations],   // already in seconds
      waveNumbers: [...this.waveNumbers],
      killsPerWave: killsPerWaveFull,
    })
  }

  /** Record a kill. Called by the kill detection loop below. */
  recordKill(): void {
    this.score += killScore(this.waveNumber)
    this.kills++
    this.currentWaveKills++
  }

  // ── Spawn cell selection ──────────────────────────────────────────────────────

  /**
   * Finds a valid spawn cell for a new enemy.
   * Rules:
   *   - Wave 1–2: scan a radius-3 Chebyshev area around the two opposite corners
   *     (top-right near (11,1) and bottom-left near (1,11)).
   *     The exact corner cells can be blocked by random destructibles, so we
   *     search the whole small region and pick the closest valid FLOOR cell.
   *   - Wave 3+: peripheral interior cells (1 tile from border, not solid, not occupied)
   *   - Minimum Chebyshev distance 3 from any player
   *   - At least one walkable adjacent cell
   */
  private findSpawnCell(players: readonly Player[]): { gx: number; gy: number } | null {
    const occupied = new Set<string>()
    for (const p of players)      occupied.add(`${p.gridX},${p.gridY}`)
    for (const e of this.enemies) occupied.add(`${e.gridX},${e.gridY}`)

    const candidates: Array<{ gx: number; gy: number }> = []

    if (this.waveNumber <= 2) {
      // Scan radius-3 area around each opposite-corner anchor.
      // The first enemy scans around (11,1), the second around (1,11).
      // We use the number of enemies already placed to decide which anchor to use.
      const anchors = [{ ax: 11, ay: 1 }, { ax: 1, ay: 11 }]
      const anchorIdx = Math.min(this.enemies.length, anchors.length - 1)
      const { ax, ay } = anchors[anchorIdx]

      for (let gx = 0; gx < GRID_COLS; gx++) {
        for (let gy = 0; gy < GRID_ROWS; gy++) {
          if (Math.max(Math.abs(gx - ax), Math.abs(gy - ay)) > 3) continue
          if (this.isValidSpawn(gx, gy, players, occupied)) candidates.push({ gx, gy })
        }
      }
      // Sort by Chebyshev distance to anchor so we pick closest first
      candidates.sort((a, b) =>
        Math.max(Math.abs(a.gx - ax), Math.abs(a.gy - ay)) -
        Math.max(Math.abs(b.gx - ax), Math.abs(b.gy - ay)),
      )
    } else {
      // Peripheral interior: cells at distance 1 from the border ring
      for (let gx = 1; gx < GRID_COLS - 1; gx++) {
        for (let gy = 1; gy < GRID_ROWS - 1; gy++) {
          const isPeripheral = gx === 1 || gy === 1 || gx === GRID_COLS - 2 || gy === GRID_ROWS - 2
          if (!isPeripheral) continue
          if (this.isValidSpawn(gx, gy, players, occupied)) candidates.push({ gx, gy })
        }
      }
    }

    // Fallback: if corner scan (waves 1–2) found nothing, search full periphery
    if (candidates.length === 0) {
      for (let gx = 1; gx < GRID_COLS - 1; gx++) {
        for (let gy = 1; gy < GRID_ROWS - 1; gy++) {
          const isPeripheral = gx === 1 || gy === 1 || gx === GRID_COLS - 2 || gy === GRID_ROWS - 2
          if (!isPeripheral) continue
          if (this.isValidSpawn(gx, gy, players, occupied)) candidates.push({ gx, gy })
        }
      }
    }

    if (candidates.length === 0) return null
    // Wave 1–2: take the closest (already sorted); wave 3+: pick randomly
    if (this.waveNumber <= 2 && candidates.length > 0) return candidates[0]
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  private isValidSpawn(
    gx: number, gy: number,
    players: readonly Player[],
    occupied: Set<string>,
  ): boolean {
    if (this.arenaState.grid[gy]?.[gx]?.type !== CellType.FLOOR) return false
    if (occupied.has(`${gx},${gy}`)) return false
    // Min distance 3 from any player
    for (const p of players) {
      if (chebyshevDist(gx, gy, p.gridX, p.gridY) < 3) return false
    }
    // At least one walkable neighbour
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]] as const
    return DIRS.some(([dx, dy]) => isCellPassable(this.arenaState, gx + dx, gy + dy))
  }
}
