// src/game/scenes/PreloadScene.ts
// Creates all tile textures programmatically using Phaser Graphics.
// No external image assets are required — everything is drawn procedurally.
// After creating textures, immediately starts GameScene and HUDScene.

import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { GameEventBus, GameEvents } from '../GameEventBus'

/** Texture key constants — used in GameScene to look up tile sprites. */
export const TextureKey = {
  FLOOR:              'tile_floor',
  SOLID_WALL:         'tile_solid_wall',
  DESTRUCTIBLE:       'tile_destructible',
  PLAYER_1:           'player_1',
  PLAYER_2:           'player_2',
  ENEMY_GRUNT:        'enemy_grunt',
  ENEMY_CHASER:       'enemy_chaser',
  ENEMY_TACTICIAN:    'enemy_tactician',
  // Arena backgrounds (one per theme)
  ARENA_NEON:         'arena_neon',
  ARENA_VOID:         'arena_void',
  ARENA_CRITICAL:     'arena_critical',
  // Themed wall textures
  WALL_NEON_SOLID:      'wall_neon_solid',
  WALL_NEON_BREAKABLE:  'wall_neon_breakable',
  WALL_VOID_SOLID:      'wall_void_solid',
  WALL_VOID_BREAKABLE:  'wall_void_breakable',
  WALL_CRIT_SOLID:      'wall_crit_solid',
  WALL_CRIT_BREAKABLE:  'wall_crit_breakable',
  // Bomb skins (one per theme)
  BOMB_NEON:     'bomb_neon',
  BOMB_VOID:     'bomb_void',
  BOMB_CRITICAL: 'bomb_critical',
} as const

export type TextureKey = (typeof TextureKey)[keyof typeof TextureKey]

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' })
  }

  preload(): void {
    // Player skins
    this.load.image(TextureKey.PLAYER_1, '/assets/images/player1-cyan.png')
    this.load.image(TextureKey.PLAYER_2, '/assets/images/player2-magenta.png')
    // Enemy skins
    this.load.image(TextureKey.ENEMY_GRUNT,     '/assets/images/enemy-grunt.png')
    this.load.image(TextureKey.ENEMY_CHASER,    '/assets/images/enemy-chaser.png')
    this.load.image(TextureKey.ENEMY_TACTICIAN, '/assets/images/enemy-tactician.png')
    // Arena background images
    this.load.image(TextureKey.ARENA_NEON,     '/assets/images/arena-neon.png')
    this.load.image(TextureKey.ARENA_VOID,     '/assets/images/arena-void.png')
    this.load.image(TextureKey.ARENA_CRITICAL, '/assets/images/arena-critical.png')
    // Themed wall textures
    this.load.image(TextureKey.WALL_NEON_SOLID,       '/assets/images/wall-neon-solid.png')
    this.load.image(TextureKey.WALL_NEON_BREAKABLE,   '/assets/images/wall-neon-breakable.png')
    this.load.image(TextureKey.WALL_VOID_SOLID,       '/assets/images/wall-void-solid.png')
    this.load.image(TextureKey.WALL_VOID_BREAKABLE,   '/assets/images/wall-void-breakable.png')
    this.load.image(TextureKey.WALL_CRIT_SOLID,       '/assets/images/wall-critical-solid.png')
    this.load.image(TextureKey.WALL_CRIT_BREAKABLE,   '/assets/images/wall-critical-breakable.png')
    // Bomb skins
    this.load.image(TextureKey.BOMB_NEON,     '/assets/images/bomb-neon.png')
    this.load.image(TextureKey.BOMB_VOID,     '/assets/images/bomb-void.png')
    this.load.image(TextureKey.BOMB_CRITICAL, '/assets/images/bomb-critical.png')
  }

  create(): void {
    this.createFloorTexture()
    this.createSolidWallTexture()
    this.createDestructibleTexture()

    // Only generate procedural player textures if the PNG failed to load
    if (!this.textures.exists(TextureKey.PLAYER_1)) {
      this.createPlayerTexture(TextureKey.PLAYER_1, 0x00fff7)
    }
    if (!this.textures.exists(TextureKey.PLAYER_2)) {
      this.createPlayerTexture(TextureKey.PLAYER_2, 0xff00cc)
    }

    // Signal React that the engine is ready (used by PhaserGame.tsx)
    GameEventBus.emit(GameEvents.GAME_READY, {})

    // Read mode from Phaser registry (set by PhaserGame.tsx before any scene ran).
    // Pass it as scene init data — GameScene.init() receives it synchronously
    // before create() runs, eliminating any event-ordering race.
    const mode = (this.game.registry.get('gameMode') as string | undefined) ?? 'solo'

    // Start the game and HUD scenes in parallel
    this.scene.launch('HUDScene')
    this.scene.start('GameScene', { mode })
  }

  // ── Tile texture builders ────────────────────────────────────────────────────

  private createFloorTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    // Dark background
    g.fillStyle(0x0d0d18)
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
    // Subtle inner border lines
    g.lineStyle(1, 0x1a1a2e, 0.8)
    g.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1)
    g.generateTexture(TextureKey.FLOOR, TILE_SIZE, TILE_SIZE)
    g.destroy()
  }

  private createSolidWallTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    // Deep body
    g.fillStyle(0x0a1428)
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
    // Neon cyan frame (solid walls glow cyan)
    g.lineStyle(2, 0x00fff7, 0.9)
    g.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2)
    // Inner cross detail
    g.lineStyle(1, 0x00fff7, 0.25)
    g.lineBetween(TILE_SIZE / 2, 4, TILE_SIZE / 2, TILE_SIZE - 4)
    g.lineBetween(4, TILE_SIZE / 2, TILE_SIZE - 4, TILE_SIZE / 2)
    g.generateTexture(TextureKey.SOLID_WALL, TILE_SIZE, TILE_SIZE)
    g.destroy()
  }

  private createDestructibleTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    const T = TILE_SIZE
    const p = 4  // padding from edge

    // Dark body with a faint magenta tint
    g.fillStyle(0x180a20)
    g.fillRect(0, 0, T, T)

    // Block fill
    g.fillStyle(0x2a0a3a)
    g.fillRect(p, p, T - p * 2, T - p * 2)

    // Magenta border
    g.lineStyle(1.5, 0xff00cc, 0.75)
    g.strokeRect(p + 0.5, p + 0.5, T - p * 2 - 1, T - p * 2 - 1)

    // Corner accents
    const c = 6
    g.lineStyle(2, 0xff00cc, 0.9)
    // top-left
    g.lineBetween(p, p, p + c, p)
    g.lineBetween(p, p, p, p + c)
    // top-right
    g.lineBetween(T - p, p, T - p - c, p)
    g.lineBetween(T - p, p, T - p, p + c)
    // bottom-left
    g.lineBetween(p, T - p, p + c, T - p)
    g.lineBetween(p, T - p, p, T - p - c)
    // bottom-right
    g.lineBetween(T - p, T - p, T - p - c, T - p)
    g.lineBetween(T - p, T - p, T - p, T - p - c)

    g.generateTexture(TextureKey.DESTRUCTIBLE, T, T)
    g.destroy()
  }

  private createPlayerTexture(key: string, color: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    const T = TILE_SIZE
    const r = T / 2 - 6  // circle radius

    // Glow layer (larger, semi-transparent)
    g.fillStyle(color, 0.2)
    g.fillCircle(T / 2, T / 2, r + 4)

    // Body
    g.fillStyle(color, 0.9)
    g.fillCircle(T / 2, T / 2, r)

    // Dark centre
    g.fillStyle(0x0a0a0f, 0.7)
    g.fillCircle(T / 2, T / 2, r - 10)

    // Direction indicator (top dot)
    g.fillStyle(color, 1)
    g.fillCircle(T / 2, T / 2 - r + 6, 4)

    g.generateTexture(key, T, T)
    g.destroy()
  }
}
