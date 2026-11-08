// src/game/systems/BombSystem.ts
// Manages the full bomb lifecycle: placement, fuse ticking, detonation,
// explosion resolution, destruction, and player hit detection.
// Designed to be owned by GameScene; update() called every frame.

import Phaser from 'phaser'
import { Bomb } from '../entities/Bomb'
import { BombState } from '../entities/BombState'
import { resolveExplosion } from './ExplosionSystem'
import { applyDestruction } from './DestructionSystem'
import { ExplosionVFX } from '../vfx/ExplosionVFX'
import { GameEventBus, GameEvents } from '../GameEventBus'
import type { ArenaState } from '../types/GridTypes'
import type { Player } from '../entities/Player'
import type { GameScene } from '../scenes/GameScene'
import type { AudioManager } from '../audio/AudioManager'

// Duration the explosion key set is kept alive (matches ExplosionVFX flash + margin)
const EXPLOSION_KEY_TTL_MS = 450

export class BombSystem {
  private readonly scene: Phaser.Scene
  private readonly gameScene: GameScene
  private readonly arenaState: ArenaState
  private readonly activeBombs: Bomb[] = []
  private readonly vfx: ExplosionVFX

  // Tracks cells currently covered by explosion VFX — used by ShiftSystem
  // to exclude unsafe destinations. Keys are "gx,gy" strings.
  private readonly _activeExplosionKeys = new Set<string>()

  /**
   * Optional hook: called with the set of blast cell keys after each explosion.
   * WaveSystem wires this to check enemy hit detection.
   */
  onExplosionCells: ((cellKeys: ReadonlySet<string>) => void) | null = null

  /** Read-only view of active explosion cells for ShiftSystem. */
  get activeExplosionKeys(): ReadonlySet<string> {
    return this._activeExplosionKeys
  }

  /** Current bomb texture key — set by GameScene after ArenaThemeManager is ready. */
  private _bombThemeKey: string | null = null

  constructor(scene: Phaser.Scene, gameScene: GameScene, arenaState: ArenaState) {
    this.scene = scene
    this.gameScene = gameScene
    this.arenaState = arenaState
    this.vfx = new ExplosionVFX(scene)
  }

  /** Wire AudioManager into ExplosionVFX (called by GameScene after audio init). */
  setExplosionAudio(audio: AudioManager): void {
    this.vfx.setAudio(audio)
  }

  /** Update the bomb skin theme. Also re-skins all currently live bombs. */
  setBombTheme(textureKey: string): void {
    this._bombThemeKey = textureKey
    for (const bomb of this.activeBombs) {
      bomb.setThemeTexture(textureKey)
    }
  }

  // ── Placement ────────────────────────────────────────────────────────────────

  /**
   * Places a bomb on behalf of an enemy (or any grid occupant).
   * Creates the bomb and wires detonation through handleDetonate with all current players.
   * Range is fixed at 2 for enemies (configurable in ST-10).
   */
  placeEnemyBomb(gridX: number, gridY: number, range = 2, ownerId = 'enemy'): Bomb | null {
    if (this.activeBombs.some(b => b.gridX === gridX && b.gridY === gridY)) return null

    const bomb = new Bomb(this.scene, gridX, gridY, range, ownerId)
    if (this._bombThemeKey) bomb.setThemeTexture(this._bombThemeKey)
    // Enemy bombs resolve against current players at detonation time
    bomb.onDetonate = () => this.handleDetonate(bomb, this._currentPlayers)
    this.scene.add.existing(bomb as unknown as Phaser.GameObjects.GameObject)
    this.activeBombs.push(bomb)
    return bomb
  }

  /** Updated each frame by BombSystem.update() — used by enemy bomb detonation. */
  private _currentPlayers: Player[] = []

  /**
   * Places a bomb for the given player.
   * Returns the new Bomb, or null if placement is not allowed
   * (already a bomb on that cell, or player is at maxBombs).
   */
  placeBomb(player: Player): Bomb | null {
    // Ensure _currentPlayers contains at least the placing player if update() hasn't run yet
    if (!this._currentPlayers.includes(player)) {
      this._currentPlayers = [...this._currentPlayers, player]
    }
    if (player.activeBombs >= player.maxBombs) return null

    // No two bombs on the same cell
    if (this.activeBombs.some(b => b.gridX === player.gridX && b.gridY === player.gridY)) {
      return null
    }

    const bomb = new Bomb(
      this.scene,
      player.gridX,
      player.gridY,
      player.bombRange,
      player.playerId,
    )
    if (this._bombThemeKey) bomb.setThemeTexture(this._bombThemeKey)

    // Wire detonation callback — use _currentPlayers (all players, updated every frame)
    // so the bomb can hit ANY player, not just its owner.
    bomb.onDetonate = () => this.handleDetonate(bomb, this._currentPlayers)

    this.scene.add.existing(bomb as unknown as Phaser.GameObjects.GameObject)
    this.activeBombs.push(bomb)

    player.activeBombs++
    player.setStats({})  // emit stats update for HUD

    GameEventBus.emit(GameEvents.BOMB_PLACED, {
      gridX: player.gridX,
      gridY: player.gridY,
      playerId: player.playerId,
    })

    return bomb
  }

  // ── Per-frame update ──────────────────────────────────────────────────────────

  /**
   * Must be called every frame from GameScene.update().
   * @param allPlayers All live players (for hit detection).
   */
  update(delta: number, allPlayers: Player[]): void {
    this._currentPlayers = allPlayers.length > 0 ? allPlayers : this._currentPlayers
    // Snapshot so we can safely mutate activeBombs inside the loop
    for (const bomb of [...this.activeBombs]) {
      if (bomb.state === BombState.FUSING) {
        bomb.update(delta)
        // If fuse expired, bomb.update() calls bomb.detonate() which fires onDetonate
      } else if (bomb.state === BombState.DETONATING) {
        // Chain-triggered bomb: onDetonate was already called with a player list
        // that might be stale — re-resolve with current allPlayers
        if (bomb.chainTriggered) {
          this.handleDetonate(bomb, allPlayers)
        }
      }
    }

    // Clean up DONE bombs
    for (let i = this.activeBombs.length - 1; i >= 0; i--) {
      if (this.activeBombs[i].state === BombState.DONE) {
        this.activeBombs.splice(i, 1)
      }
    }
  }

  // ── Detonation ────────────────────────────────────────────────────────────────

  private handleDetonate(bomb: Bomb, allPlayers: Player[]): void {
    if (bomb.state === BombState.DONE) return  // already processed

    // Resolve the explosion (pure — no side effects on arena yet)
    const result = resolveExplosion(bomb, this.arenaState, this.activeBombs, allPlayers)

    // Apply destruction to arena + scene FIRST — so freshly cleared cells
    // are eligible as SHIFT destinations (plan rule: post-destruction state)
    // shortcut: power-ups collected but not rendered until ST-13
    applyDestruction(result.destroyedBlocks, this.arenaState, this.gameScene)

    // Track explosion cells so ShiftSystem can exclude them (unsafe during VFX)
    for (const c of result.cells) {
      const key = `${c.gx},${c.gy}`
      this._activeExplosionKeys.add(key)
    }
    // Remove keys after VFX has faded
    this.scene.time.delayedCall(EXPLOSION_KEY_TTL_MS, () => {
      for (const c of result.cells) this._activeExplosionKeys.delete(`${c.gx},${c.gy}`)
    })

    // Open SHIFT window for the bomb's owner (after destruction so fresh cells eligible)
    const owner = allPlayers.find(p => p.playerId === bomb.ownerId)
    if (owner && owner.isAlive) {
      owner.openShiftWindow(result.cells.map(c => ({ gx: c.gx, gy: c.gy })), 800)
    }

    // VFX + screen shake
    this.vfx.play(result.cells, result.chainCount)

    // Emit explosion event
    GameEventBus.emit(GameEvents.BOMB_EXPLODED, {
      cells: result.cells.map(c => ({ gx: c.gx, gy: c.gy })),
    })

    // Hit players (checked after SHIFT window opens — player can escape if they're fast)
    for (const p of result.hitPlayers) {
      p.takeDamage()
    }

    // Notify enemy hit detection (wired by GameScene to WaveSystem)
    if (this.onExplosionCells) {
      const keys = new Set(result.cells.map(c => `${c.gx},${c.gy}`))
      this.onExplosionCells(keys)
    }

    // Return bomb slot to owner
    if (owner) {
      owner.activeBombs = Math.max(0, owner.activeBombs - 1)
      owner.setStats({})  // emit HUD update
    }

    // Mark any chain-triggered bombs as done too
    for (const b of this.activeBombs) {
      if (b.chainTriggered && b.state === BombState.DETONATING) {
        b.markDone()
        const chainOwner = allPlayers.find(p => p.playerId === b.ownerId)
        if (chainOwner) {
          chainOwner.activeBombs = Math.max(0, chainOwner.activeBombs - 1)
          chainOwner.setStats({})
        }
      }
    }

    bomb.markDone()
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  /** Destroy all active bombs. Call on scene shutdown. */
  shutdown(): void {
    for (const bomb of this.activeBombs) {
      bomb.destroy()
    }
    this.activeBombs.length = 0
  }

  get bombs(): readonly Bomb[] {
    return this.activeBombs
  }
}
