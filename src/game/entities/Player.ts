// src/game/entities/Player.ts
// Player entity — grid-aligned movement with smooth tween interpolation.
// Collision is checked against ArenaState before committing each move.
// Supports two independent input schemes (P1: WASD, P2: Arrows).
// Lives system: takeDamage() decrements lives; truly dies at 0.
// GameScene wires onDamaged() for mode-specific respawn logic.

import Phaser from 'phaser'
import { TILE_SIZE, cellToPixel } from '../constants'
import type { ArenaState } from '../types/GridTypes'
import { isCellPassable } from '../utils/collisions'
import type { InputScheme } from '../input/InputScheme'
import { GameEventBus, GameEvents } from '../GameEventBus'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerStats {
  speed: number          // moves per second (default 4)
  maxBombs: number       // maximum simultaneously active bombs (default 1)
  bombRange: number      // explosion arm length in tiles (default 2)
  lives: number          // remaining lives (default 3)
  shiftCooldownMs: number // SHIFT cooldown in ms (default 10 000)
}

const DEFAULT_STATS: PlayerStats = {
  speed: 4,
  maxBombs: 1,
  bombRange: 2,
  lives: 3,
  shiftCooldownMs: 10_000,
}

// ─── Player class ─────────────────────────────────────────────────────────────

export class Player extends Phaser.GameObjects.Container {
  readonly playerId: string

  // Grid position (integer tile coordinates)
  gridX: number
  gridY: number

  // Stats (mutable by power-ups / game mode)
  speed: number
  maxBombs: number
  bombRange: number
  lives: number
  shiftCooldownMs: number
  isAlive: boolean = true
  /** Invincibility frames — player cannot take damage while > 0. */
  invincibleMs: number = 0
  /** Spawn position — used by GameScene to respawn on takeDamage. */
  spawnGx: number = 0
  spawnGy: number = 0

  // Bomb tracking (updated by BombSystem in ST-06)
  activeBombs: number = 0

  // SHIFT state (managed by ShiftSystem in ST-07)
  shiftWindowOpen: boolean = false
  shiftWindowExpiresAt: number = 0
  shiftCooldownRemainingMs: number = 0
  shiftBlastCells: Array<{ gx: number; gy: number }> = []

  // Movement tween state
  private isTweening: boolean = false
  private pendingDx: number = 0
  private pendingDy: number = 0
  private shiftKeyWasDown: boolean = false

  // References set in init()
  private arenaState!: ArenaState
  private inputScheme!: InputScheme
  // Can be an Image (when PNG loaded) or Rectangle (procedural fallback)
  private bodySprite!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle

  /** True when this player's bomb key is currently held down. */
  get bombKeyIsDown(): boolean {
    return this.inputScheme?.bomb?.isDown ?? false
  }

  /** True when this player's SHIFT key is currently held down. */
  get shiftKeyIsDown(): boolean {
    return this.inputScheme?.shift?.isDown ?? false
  }

  /**
   * Injected by GameScene after init().
   * Called when the SHIFT key is pressed and the window is open.
   * GameScene wires this to ShiftSystem.tryShift() so Player stays decoupled.
   */
  onShiftPressed: (() => void) | null = null

  /**
   * Injected by GameScene.
   * Called after takeDamage() when the player lost a life but is still alive.
   * Used for mode-specific respawn logic (solo only).
   */
  onDamaged: (() => void) | null = null

  constructor(scene: Phaser.Scene, playerId: string) {
    // Position is set after creation via place()
    super(scene, 0, 0)
    this.playerId = playerId
    this.gridX = 0
    this.gridY = 0

    // Copy defaults
    const s = DEFAULT_STATS
    this.speed = s.speed
    this.maxBombs = s.maxBombs
    this.bombRange = s.bombRange
    this.lives = s.lives
    this.shiftCooldownMs = s.shiftCooldownMs
  }

  // ── Setup ────────────────────────────────────────────────────────────────────

  /**
   * Finalize initialization. Must be called after adding the player to the scene.
   *
   * @param gx          Starting grid column.
   * @param gy          Starting grid row.
   * @param arena       Live ArenaState for collision checks.
   * @param scheme      Input key bindings for this player.
   * @param color       Body colour in hex (e.g. 0x00ffff for P1, 0xff00ff for P2).
   */
  init(
    gx: number,
    gy: number,
    arena: ArenaState,
    scheme: InputScheme,
    color: number,
  ): void {
    this.gridX = gx
    this.gridY = gy
    this.spawnGx = gx
    this.spawnGy = gy
    this.arenaState = arena
    this.inputScheme = scheme

    // Body: use PNG if loaded, fall back to coloured rectangle + glow halo
    const textureKey = this.playerId === 'p1' ? 'player_1' : 'player_2'
    if (this.scene.textures.exists(textureKey)) {
      const img = this.scene.add.image(0, 0, textureKey)
      // Scale to fit inside the tile with a small margin
      const targetSize = TILE_SIZE - 6
      const scale = targetSize / Math.max(img.width, img.height)
      img.setScale(scale)
      this.bodySprite = img
      this.add(this.bodySprite)
    } else {
      // Glow halo only for procedural fallback (avoids colored square behind PNG)
      const haloSize = TILE_SIZE - 4
      const halo = this.scene.add.rectangle(0, 0, haloSize, haloSize, color, 0.15)
      this.add(halo)
      this.bodySprite = this.scene.add.rectangle(0, 0, TILE_SIZE - 8, TILE_SIZE - 8, color)
      this.add(this.bodySprite)
    }

    // Position the container at the tile centre.
    const px = cellToPixel(gx, gy)
    this.setPosition(px.x, px.y)
    this.setDepth(2)

    this.emitStats()
  }

  // ── Stats API ─────────────────────────────────────────────────────────────────

  /**
   * Overrides one or more stats. Emits a stats-changed event after applying.
   * Called by the power-up system and game mode configuration.
   */
  setStats(partial: Partial<PlayerStats>): void {
    if (partial.speed        !== undefined) this.speed        = partial.speed
    if (partial.maxBombs     !== undefined) this.maxBombs     = partial.maxBombs
    if (partial.bombRange    !== undefined) this.bombRange    = partial.bombRange
    if (partial.lives        !== undefined) this.lives        = partial.lives
    if (partial.shiftCooldownMs !== undefined) this.shiftCooldownMs = partial.shiftCooldownMs
    this.emitStats()
  }

  // ── SHIFT window API (called by ShiftSystem / ExplosionSystem in ST-07) ───────

  /**
   * Opens the SHIFT activation window for the given duration.
   * blastCells should be provided AFTER DestructionSystem has run.
   */
  openShiftWindow(blastCells: Array<{ gx: number; gy: number }>, windowMs: number): void {
    this.shiftWindowOpen = true
    this.shiftWindowExpiresAt = this.scene.time.now + windowMs
    this.shiftBlastCells = blastCells
  }

  closeShiftWindow(): void {
    this.shiftWindowOpen = false
    this.shiftBlastCells = []
  }

  // ── Per-frame update ──────────────────────────────────────────────────────────

  // ── Respawn ───────────────────────────────────────────────────────────────────

  /**
   * Revives the player at the given grid cell.
   * Called by GameScene after the respawn delay expires.
   */
  revive(gx: number, gy: number): void {
    this.isAlive = true
    this.invincibleMs = 2_000  // 2 s of invincibility after respawn
    this.gridX = gx
    this.gridY = gy
    const px = cellToPixel(gx, gy)
    this.setPosition(px.x, px.y)
    this.setVisible(true)
    this.setAlpha(1)
    this.emitStats()
  }

  update(delta: number): void {
    if (!this.isAlive) return

    // Tick invincibility
    if (this.invincibleMs > 0) {
      this.invincibleMs = Math.max(0, this.invincibleMs - delta)
      // Flash effect during invincibility
      this.setAlpha(Math.sin(this.scene.time.now / 80) > 0 ? 1 : 0.3)
    } else {
      this.setAlpha(1)
    }

    // Tick down SHIFT cooldown
    if (this.shiftCooldownRemainingMs > 0) {
      this.shiftCooldownRemainingMs = Math.max(0, this.shiftCooldownRemainingMs - delta)
      if (this.shiftCooldownRemainingMs === 0) {
        GameEventBus.emit(GameEvents.SHIFT_READY, { playerId: this.playerId })
      }
    }

    // Expire SHIFT window
    if (this.shiftWindowOpen && this.scene.time.now >= this.shiftWindowExpiresAt) {
      this.closeShiftWindow()
    }

    // SHIFT key just-pressed → fire callback (injected by GameScene)
    const shiftDown = this.shiftKeyIsDown
    if (shiftDown && !this.shiftKeyWasDown && this.shiftWindowOpen) {
      this.onShiftPressed?.()
    }
    this.shiftKeyWasDown = shiftDown

    // Movement — only queue a new move if not currently tweening
    if (!this.isTweening) {
      this.readMovementInput()
      if (this.pendingDx !== 0 || this.pendingDy !== 0) {
        this.tryMove(this.pendingDx, this.pendingDy)
        this.pendingDx = 0
        this.pendingDy = 0
      }
    }
  }

  // ── Internal movement helpers ─────────────────────────────────────────────────

  private readMovementInput(): void {
    const s = this.inputScheme
    // Priority: up > down > left > right (arbitrary; prevents diagonal drift)
    if (s.up.isDown)    { this.pendingDx = 0;  this.pendingDy = -1 }
    else if (s.down.isDown)  { this.pendingDx = 0;  this.pendingDy =  1 }
    else if (s.left.isDown)  { this.pendingDx = -1; this.pendingDy =  0 }
    else if (s.right.isDown) { this.pendingDx =  1; this.pendingDy =  0 }
  }

  /**
   * Attempts to move the player by (dx, dy) grid cells.
   * Performs a collision check first. If passable, starts a movement tween.
   */
  private tryMove(dx: number, dy: number): void {
    const nextX = this.gridX + dx
    const nextY = this.gridY + dy

    if (!this.isCellPassable(nextX, nextY)) return

    // Commit grid position immediately so other systems see the updated coords
    this.gridX = nextX
    this.gridY = nextY

    const dest = cellToPixel(nextX, nextY)
    const duration = 1000 / this.speed

    this.isTweening = true
    this.scene.tweens.add({
      targets: this,
      x: dest.x,
      y: dest.y,
      duration,
      ease: 'Linear',
      onComplete: () => {
        this.isTweening = false
      },
    })
  }

  /** Returns true when the cell at (gx, gy) can be entered. */
  isCellPassable(gx: number, gy: number): boolean {
    return isCellPassable(this.arenaState, gx, gy)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /**
   * Apply damage: decrement lives, emit stats.
   * If lives reach 0, calls _die(). Otherwise calls onDamaged() so
   * GameScene can schedule a respawn (solo mode).
   * No-op while invincible.
   */
  takeDamage(): void {
    if (!this.isAlive) return
    if (this.invincibleMs > 0) return  // still invincible
    this.lives = Math.max(0, this.lives - 1)
    this.emitStats()
    if (this.lives === 0) {
      this._die()
    } else {
      // Temporarily hide until respawn
      this.setVisible(false)
      this.onDamaged?.()
    }
  }

  /**
   * Immediately kill — used for enemies and direct death (e.g. WaveSystem game-over check).
   * Bypasses lives; sets isAlive=false unconditionally.
   */
  kill(): void {
    this._die()
  }

  private _die(): void {
    this.isAlive = false
    this.setVisible(false)
    GameEventBus.emit(GameEvents.PLAYER_DIED, { playerId: this.playerId })
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private emitStats(): void {
    GameEventBus.emit(GameEvents.PLAYER_STATS_CHANGED, {
      playerId: this.playerId,
      activeBombs: this.activeBombs,
      maxBombs: this.maxBombs,
      bombRange: this.bombRange,
      lives: this.lives,
      shiftCooldownRemainingMs: this.shiftCooldownRemainingMs,
      shiftCooldownMs: this.shiftCooldownMs,
    })
  }
}
