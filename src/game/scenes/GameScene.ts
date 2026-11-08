// src/game/scenes/GameScene.ts
// Renders the 13×13 arena grid using tile sprites created in PreloadScene.
// Manages the live ArenaState and exposes mutation methods for game systems.
// ST-06: players and bombs. ST-07: SHIFT mechanic wired here.
// ST-11: HUD via HUDScene. ST-13: AudioManager wired here.

import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { generateArena } from '../arena/ArenaGenerator'
import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'
import { TextureKey } from './PreloadScene'
import { Player } from '../entities/Player'
import { BombSystem } from '../systems/BombSystem'
import { ShiftEventSystem } from '../systems/ShiftEventSystem'
import { WaveSystem } from '../systems/WaveSystem'
import { tryShift } from '../systems/ShiftSystem'
import { GameEventBus, GameEvents } from '../GameEventBus'
import { ShiftVFX } from '../vfx/ShiftVFX'
import { ArenaThemeManager } from '../vfx/ArenaThemeManager'
import { createSchemeP1, createSchemeP2 } from '../input/InputConfig'
import { audioManager } from '../audio/AudioManager'

export class GameScene extends Phaser.Scene {
  private arenaState!: ArenaState
  private tileSprites!: Phaser.GameObjects.Image[][]

  // ST-06/ST-08/ST-09/ST-10: game systems
  private players: Player[] = []
  private bombSystem!: BombSystem
  private shiftVFX!: ShiftVFX
  private shiftEventSystem!: ShiftEventSystem
  private waveSystem: WaveSystem | null = null
  private pvpGameOverEmitted = false
  private pvpStartTime = 0
  private arenaTheme!: ArenaThemeManager
  // ST-13: audio (singleton — shared with the rest of the app)
  private readonly audio = audioManager

  // Mode received from PreloadScene via scene init data (set by PhaserGame.tsx registry)
  private gameMode: 'solo' | '1v1' = 'solo'

  // Tracks bomb-key state per player to detect just-pressed (no repeated placement)
  private bombKeyWasDown: boolean[] = [false, false]

  /** Publicly accessible so other game systems can read cell data. */
  get arena(): Readonly<ArenaState> {
    return this.arenaState
  }

  constructor() {
    super({ key: 'GameScene' })
  }

  // Phaser calls init() with the data object from scene.start('GameScene', data)
  // BEFORE create() runs — this is the correct place to receive mode.
  init(data: { mode?: string }): void {
    this.gameMode = data.mode === '1v1' ? '1v1' : 'solo'
  }

  create(): void {
    this.arenaState = generateArena({ blockDensity: 0.65 })
    this.tileSprites = []
    this.players = []
    this.bombKeyWasDown = [false, false]
    this.pvpGameOverEmitted = false
    this.pvpStartTime = Date.now()  // wall clock — immune to Phaser clock offset

    this.renderArena()
    this.arenaTheme = new ArenaThemeManager(this)
    this.arenaTheme.registerTiles(this._collectAllTiles())
    this.shiftVFX = new ShiftVFX(this)
    this.shiftVFX.setAudio(this.audio)
    this.initPlayers()
    this.bombSystem = new BombSystem(this, this, this.arenaState)
    // Wire audio into BombSystem's explosion VFX
    this.bombSystem.setExplosionAudio(this.audio)
    // Set initial bomb theme texture
    this.bombSystem.setBombTheme(this.arenaTheme.currentBombKey)
    this.wireSHIFT()

    // ST-08: arena dynamic events
    this.shiftEventSystem = new ShiftEventSystem(this, this)
    this.shiftEventSystem.start(this.arenaState, () => [
      ...this.players,
      ...(this.waveSystem?.activeEnemies ?? []),
      ...this.bombSystem.bombs,
    ])

    // ST-09: wave system — solo mode only
    if (this.gameMode === 'solo') {
      this.waveSystem = new WaveSystem(
        this, this, this.arenaState,
        () => this.players,
        () => [...this.bombSystem.bombs],
        (enemy) => {
          // Use BombSystem.placeEnemyBomb so the full detonation pipeline runs
          this.bombSystem.placeEnemyBomb(enemy.gridX, enemy.gridY, 2, `enemy_${enemy.tier}`)
        },
      )
      this.waveSystem.startWave(1)

      // Wire enemy kill detection
      this.bombSystem.onExplosionCells = (cellKeys) => {
        for (const enemy of this.waveSystem?.activeEnemies ?? []) {
          if (enemy.isAlive && cellKeys.has(`${enemy.gridX},${enemy.gridY}`)) {
            enemy.kill()
            this.waveSystem?.recordKill()
          }
        }
      }
    }

    // ST-13: wire audio for game events
    const unsubBomb  = GameEventBus.on(GameEvents.BOMB_PLACED,  () => this.audio.playBombPlace())
    const unsubDied  = GameEventBus.on(GameEvents.PLAYER_DIED,  () => this.audio.playPlayerDeath())
    const unsubWave  = GameEventBus.on(GameEvents.WAVE_START,   () => this.audio.playWaveStart())
    const unsubArena = GameEventBus.on(GameEvents.ARENA_SHIFT_EVENT, () => {
      this.audio.playArenaEvent()
      this.arenaTheme.nextTheme()
      // Update bomb skins for the new theme (live bombs + future placements)
      this.bombSystem.setBombTheme(this.arenaTheme.currentBombKey)
    })

    // BGM: start after a single frame so the AudioContext is unblocked (user clicked to get here)
    this.time.delayedCall(100, () => this.audio.startMusic())

    // Clean up on scene shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bombSystem.shutdown()
      this.shiftEventSystem.shutdown()
      this.waveSystem?.shutdown()
      this.audio.stopMusic()
      unsubBomb(); unsubDied(); unsubWave(); unsubArena()
    })
  }

  update(_time: number, delta: number): void {
    for (const p of this.players) p.update(delta)
    this.bombSystem.update(delta, this.players)
    this.waveSystem?.update(delta)
    this.handleBombInput()
    if (this.gameMode === '1v1') this.checkPvPGameOver()
  }

  // ── 1v1 game-over detection ───────────────────────────────────────────────────

  private checkPvPGameOver(): void {
    if (this.pvpGameOverEmitted || this.players.length < 2) return

    const [p1, p2] = this.players
    const p1Dead = !p1.isAlive
    const p2Dead = !p2.isAlive

    if (!p1Dead && !p2Dead) return  // both alive

    this.pvpGameOverEmitted = true
    const durationSeconds = Math.round((Date.now() - this.pvpStartTime) / 1000)

    const winner: 'p1' | 'p2' | undefined =
      p1Dead && p2Dead ? undefined  // draw
      : p1Dead ? 'p2'
      : 'p1'

    const result = p1Dead && p2Dead ? 'draw' : 'win'

    GameEventBus.emit(GameEvents.GAME_OVER, {
      mode: '1v1',
      winner,
      result,
      durationSeconds,
    })
  }

  // ── Player initialization ─────────────────────────────────────────────────────

  private initPlayers(): void {
    // P1 always spawns top-left corner (1,1)
    const p1 = new Player(this, 'p1')
    this.add.existing(p1)
    p1.init(1, 1, this.arenaState, createSchemeP1(this.input.keyboard!), 0x00fff7)

    // P2 only in 1v1 mode; spawns bottom-right (11,11)
    if (this.gameMode === '1v1') {
      // 1v1: instant elimination — 1 life each (plan ST-10)
      p1.setStats({ lives: 1 })
      const p2 = new Player(this, 'p2')
      this.add.existing(p2)
      p2.init(11, 11, this.arenaState, createSchemeP2(this.input.keyboard!), 0xff00cc)
      p2.setStats({ lives: 1 })
      this.players.push(p1)
      this.players.push(p2)
    } else {
      // Solo: 3 lives with respawn (plan ST-09)
      this.players.push(p1)
      this.wireRespawn(p1)
    }
  }

  /** Wire solo respawn: after taking damage (still alive), respawn at spawn point after 2 s. */
  private wireRespawn(player: Player): void {
    player.onDamaged = () => {
      // player is alive but invisible; revive after 2 s at spawn point
      this.time.delayedCall(2_000, () => {
        if (player.isAlive) {
          player.revive(player.spawnGx, player.spawnGy)
        }
        // if player somehow died (lives hit 0) in the interim, skip revive
      })
    }
  }

  // ── SHIFT wiring ─────────────────────────────────────────────────────────────

  private wireSHIFT(): void {
    for (const player of this.players) {
      player.onShiftPressed = () => {
        const fromGx = player.gridX
        const fromGy = player.gridY
        const result = tryShift(
          player,
          this.arenaState,
          this.bombSystem.bombs,
          this.players,
        )
        if (result.success) {
          this.shiftVFX.play(player, fromGx, fromGy)
        }
      }
    }
  }

  // ── Bomb input (just-pressed detection) ──────────────────────────────────────

  private handleBombInput(): void {
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i]
      if (!player.isAlive) continue

      const isDown = player.bombKeyIsDown
      if (isDown && !this.bombKeyWasDown[i]) {
        this.bombSystem!.placeBomb(player)
      }
      this.bombKeyWasDown[i] = isDown
    }
  }

  // ── Arena rendering ──────────────────────────────────────────────────────────

  /** Returns all tile sprites with their cell type for ArenaThemeManager. */
  private _collectAllTiles(): import('../vfx/ArenaThemeManager').TileEntry[] {
    const result: import('../vfx/ArenaThemeManager').TileEntry[] = []
    for (let gy = 0; gy < this.arenaState.height; gy++) {
      for (let gx = 0; gx < this.arenaState.width; gx++) {
        result.push({
          sprite: this.tileSprites[gy][gx],
          type:   this.arenaState.grid[gy][gx].type,
        })
      }
    }
    return result
  }

  private renderArena(): void {
    for (let gy = 0; gy < this.arenaState.height; gy++) {
      const row: Phaser.GameObjects.Image[] = []
      for (let gx = 0; gx < this.arenaState.width; gx++) {
        const cell = this.arenaState.grid[gy][gx]
        const key = this.textureKeyForCell(cell.type)
        const x = gx * TILE_SIZE + TILE_SIZE / 2
        const y = gy * TILE_SIZE + TILE_SIZE / 2
        const sprite = this.add.image(x, y, key)
        sprite.setDepth(0)
        row.push(sprite)
      }
      this.tileSprites.push(row)
    }
  }

  private textureKeyForCell(type: CellType): string {
    switch (type) {
      case CellType.SOLID_WALL:   return TextureKey.SOLID_WALL
      case CellType.DESTRUCTIBLE: return TextureKey.DESTRUCTIBLE
      default:                    return TextureKey.FLOOR
    }
  }

  // ── Public mutation API (used by bomb/explosion systems) ─────────────────────

  /**
   * Removes a destructible block at (gx, gy) and replaces it with a floor tile.
   * No-op if the cell is not DESTRUCTIBLE.
   */
  destroyBlock(gx: number, gy: number): void {
    const cell = this.arenaState.grid[gy]?.[gx]
    if (!cell || cell.type !== CellType.DESTRUCTIBLE) return

    cell.type = CellType.FLOOR
    const sprite = this.tileSprites[gy][gx]
    sprite.setTexture(TextureKey.FLOOR)
    this.arenaTheme.updateTileType(sprite, CellType.FLOOR)
  }

  /**
   * Updates a cell's type and refreshes its sprite.
   * Used by arena mutation system (ST-08) and power-up spawning (ST-06).
   */
  updateCell(gx: number, gy: number, type: CellType): void {
    const cell = this.arenaState.grid[gy]?.[gx]
    if (!cell) return

    cell.type = type
    const sprite = this.tileSprites[gy][gx]
    sprite.setTexture(this.textureKeyForCell(type))
    this.arenaTheme.updateTileType(sprite, type)
  }
}
