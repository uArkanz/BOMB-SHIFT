// src/game/vfx/ArenaThemeManager.ts
// Manages visual arena theme cycling on SHIFT EVENTs.
// Three themes: NEON (cyan), VOID (magenta), CRITICAL (orange-red).
//
// Background: uses PNG arena images if loaded (cross-fade), falls back to Graphics.
// Walls: swaps solid/breakable tile textures to match theme.
// Floor: tints floor tile sprites with theme accent.

import Phaser from 'phaser'
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, GRID_COLS, GRID_ROWS } from '../constants'
import { CellType } from '../types/GridTypes'

// ─── Theme definitions ────────────────────────────────────────────────────────

interface Theme {
  name: string
  bgKey:        string
  solidKey:     string
  breakableKey: string
  bombKey:      string   // bomb texture for this theme
  bgColor:      number
  bgAlpha:      number
  floorTint:    number
  accentColor:  number
}

const THEMES: Theme[] = [
  {
    name: 'NEON',
    bgKey: 'arena_neon', solidKey: 'wall_neon_solid', breakableKey: 'wall_neon_breakable', bombKey: 'bomb_neon',
    bgColor: 0x000814, bgAlpha: 0.92, floorTint: 0x7ae8f0, accentColor: 0x00fff7,
  },
  {
    name: 'VOID',
    bgKey: 'arena_void', solidKey: 'wall_void_solid', breakableKey: 'wall_void_breakable', bombKey: 'bomb_void',
    bgColor: 0x0a000d, bgAlpha: 0.94, floorTint: 0xc87de8, accentColor: 0xff00cc,
  },
  {
    name: 'CRITICAL',
    bgKey: 'arena_critical', solidKey: 'wall_crit_solid', breakableKey: 'wall_crit_breakable', bombKey: 'bomb_critical',
    bgColor: 0x120200, bgAlpha: 0.95, floorTint: 0xe87040, accentColor: 0xff4400,
  },
]

// ─── Tile registry entry ──────────────────────────────────────────────────────

interface TileEntry {
  sprite: Phaser.GameObjects.Image
  type:   CellType  // current cell type (FLOOR | SOLID_WALL | DESTRUCTIBLE)
}

// ─── ArenaThemeManager ────────────────────────────────────────────────────────

export class ArenaThemeManager {
  private readonly scene: Phaser.Scene
  private themeIndex = 0

  // Tile registry — all sprites passed in from GameScene
  private tiles: TileEntry[] = []

  // Background layer — either two Image objects (for cross-fade) or a Graphics fallback
  private bgCurrent: Phaser.GameObjects.Image | null = null
  private bgGfx:     Phaser.GameObjects.Graphics | null = null  // fallback

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Register all tile sprites with their current cell type.
   * Call once after GameScene.renderArena().
   * Also initialises the background layer.
   */
  registerTiles(entries: TileEntry[]): void {
    this.tiles = entries
    this._initBackground(THEMES[0])
    this._applyWalls(THEMES[0])
    this._applyFloorTint(THEMES[0], 1)
  }

  /** Returns the bomb texture key for the current theme. */
  get currentBombKey(): string {
    return THEMES[this.themeIndex].bombKey
  }

  /** Advance to next theme. Called on ARENA_SHIFT_EVENT. */
  nextTheme(): void {
    this.themeIndex = (this.themeIndex + 1) % THEMES.length
    this._transition(THEMES[this.themeIndex])
  }

  /** Update a tile's recorded type (call when destroyBlock / updateCell happens). */
  updateTileType(sprite: Phaser.GameObjects.Image, type: CellType): void {
    const entry = this.tiles.find(t => t.sprite === sprite)
    if (entry) {
      entry.type = type
    } else {
      this.tiles.push({ sprite, type })
    }
    if (type === CellType.FLOOR) {
      const theme = THEMES[this.themeIndex]
      sprite.setTint(theme.floorTint)
      sprite.setAlpha(0.85)
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private _initBackground(theme: Theme): void {
    if (this.scene.textures.exists(theme.bgKey)) {
      this.bgCurrent = this._makeBgImage(theme.bgKey)
    } else {
      this.bgGfx = this._makeGfxBg(theme)
    }
  }

  private _transition(theme: Theme): void {
    this._transitionBackground(theme)
    // Walls update slightly after BG fade starts (feels more intentional)
    this.scene.time.delayedCall(200, () => this._applyWalls(theme))
    this.scene.time.delayedCall(250, () => this._applyFloorTint(theme, 0.85))
  }

  private _transitionBackground(theme: Theme): void {
    if (this.scene.textures.exists(theme.bgKey)) {
      // PNG path: cross-fade old → new
      const next = this._makeBgImage(theme.bgKey)
      next.setAlpha(0)

      this.scene.tweens.add({
        targets:  next,
        alpha:    1,
        duration: 600,
        ease:     'Quad.easeInOut',
      })

      // Fade out old BG
      const old = this.bgCurrent ?? this.bgGfx
      if (old) {
        this.scene.tweens.add({
          targets:  old,
          alpha:    0,
          duration: 400,
          ease:     'Quad.easeIn',
          onComplete: () => { old.destroy() },
        })
        this.bgCurrent = null
        this.bgGfx     = null
      }

      this.bgCurrent = next
    } else {
      // Graphics fallback: fade-redraw
      const gfx = this.bgGfx ?? this._makeGfxBg(theme)
      this.bgGfx = gfx
      this.scene.tweens.add({
        targets:  gfx,
        alpha:    0,
        duration: 300,
        ease:     'Quad.easeIn',
        onComplete: () => {
          gfx.clear()
          this._drawGfxBg(gfx, theme)
          gfx.setAlpha(0)
          this.scene.tweens.add({
            targets: gfx, alpha: 1, duration: 400, ease: 'Quad.easeOut',
          })
        },
      })
    }
  }

  private _applyWalls(theme: Theme): void {
    const hasSolid     = this.scene.textures.exists(theme.solidKey)
    const hasBreakable = this.scene.textures.exists(theme.breakableKey)

    for (const { sprite, type } of this.tiles) {
      if (type === CellType.SOLID_WALL && hasSolid) {
        sprite.setTexture(theme.solidKey)
        sprite.setTint(0xffffff)
        sprite.setAlpha(1)
        this._fitSprite(sprite)
      } else if (type === CellType.DESTRUCTIBLE && hasBreakable) {
        sprite.setTexture(theme.breakableKey)
        sprite.setTint(0xffffff)
        sprite.setAlpha(1)
        this._fitSprite(sprite)
      }
      // FLOOR tiles are handled by _applyFloorTint; destroyed tiles already FLOOR
    }
  }

  private _applyFloorTint(theme: Theme, alpha: number): void {
    for (const { sprite, type } of this.tiles) {
      if (type === CellType.FLOOR) {
        sprite.setTint(theme.floorTint)
        sprite.setAlpha(alpha)
      }
    }
  }

  private _makeBgImage(key: string): Phaser.GameObjects.Image {
    const img = this.scene.add.image(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, key)
    // Scale to cover the full arena canvas
    const scaleX = CANVAS_WIDTH  / img.width
    const scaleY = CANVAS_HEIGHT / img.height
    img.setScale(Math.max(scaleX, scaleY))
    img.setDepth(-2)
    img.setAlpha(1)
    return img
  }

  private _makeGfxBg(theme: Theme): Phaser.GameObjects.Graphics {
    const gfx = this.scene.add.graphics()
    gfx.setDepth(-2)
    this._drawGfxBg(gfx, theme)
    return gfx
  }

  private _drawGfxBg(gfx: Phaser.GameObjects.Graphics, theme: Theme): void {
    gfx.clear()
    gfx.fillStyle(theme.bgColor, theme.bgAlpha)
    gfx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    // Grid lines
    gfx.lineStyle(1, theme.accentColor, 0.06)
    for (let gx = 0; gx <= GRID_COLS; gx++) {
      gfx.lineBetween(gx * TILE_SIZE, 0, gx * TILE_SIZE, CANVAS_HEIGHT)
    }
    for (let gy = 0; gy <= GRID_ROWS; gy++) {
      gfx.lineBetween(0, gy * TILE_SIZE, CANVAS_WIDTH, gy * TILE_SIZE)
    }
  }

  /** Scale a wall sprite to fit the tile size. */
  private _fitSprite(sprite: Phaser.GameObjects.Image): void {
    const scale = TILE_SIZE / Math.max(sprite.width, sprite.height)
    if (isFinite(scale) && scale > 0) sprite.setScale(scale)
  }
}

export type { TileEntry }
