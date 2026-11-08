// src/game/scenes/HUDScene.ts
// In-game HUD overlay rendered on top of GameScene.
// Subscribes to GameEventBus events only — holds NO references to game-logic objects.
// Panels: P1 (bottom-left), P2 (bottom-right, 1v1 only), Solo info bar (top-centre).
// Banner: wave start, wave complete, arena shift event.

import Phaser from 'phaser'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants'
import { GameEventBus, GameEvents } from '../GameEventBus'
import type { GameEventPayloads } from '../GameEventBus'

// ─── Layout constants ─────────────────────────────────────────────────────────

const PANEL_W    = 240
const PANEL_H    = 100
const PANEL_PAD  = 10
const PANEL_Y    = CANVAS_HEIGHT - PANEL_H - 10

// Shift bar sits at the bottom of the panel
const BAR_W      = PANEL_W - PANEL_PAD * 2
const BAR_H      = 8
const BAR_Y_OFF  = PANEL_H - BAR_H - PANEL_PAD  // relative to PANEL_Y

// Colours
const C_P1       = 0x00fff7
const C_P2       = 0xff00cc
const C_BAR_BG   = 0x1a1a2e
const C_BAR_FULL = 0x00fff7
const C_PANEL_BG = 0x0a0a0f
const ALPHA_BG   = 0.82

// ─── Player panel state ───────────────────────────────────────────────────────

interface PlayerHUDState {
  activeBombs: number
  maxBombs: number
  bombRange: number
  lives: number
  shiftCooldownRemainingMs: number
  shiftCooldownMs: number
  isAlive: boolean
}

const defaultState = (): PlayerHUDState => ({
  activeBombs: 0,
  maxBombs: 1,
  bombRange: 2,
  lives: 3,
  shiftCooldownRemainingMs: 0,
  shiftCooldownMs: 10_000,
  isAlive: true,
})

// ─── HUDScene ─────────────────────────────────────────────────────────────────

export class HUDScene extends Phaser.Scene {
  // Player state (updated by events)
  private p1: PlayerHUDState = defaultState()
  private p2: PlayerHUDState = defaultState()
  private gameMode: 'solo' | '1v1' = 'solo'
  // Display names (set from registry in create())
  private p1DisplayName = 'P1'
  private p2DisplayName = 'P2'

  // Solo bar state
  private waveNumber    = 1
  private enemyCount    = 0
  private score         = 0

  // Graphics objects (rebuilt when create() runs)
  private gfx!: Phaser.GameObjects.Graphics

  // ── P1 panel text objects ─────────────────────────────────────────────────────
  private p1Lives!:   Phaser.GameObjects.Text  // "VIDAS: ❤❤❤"
  private p1Bombs!:   Phaser.GameObjects.Text  // "BOMBAS: 0/1"
  private p1Range!:   Phaser.GameObjects.Text  // "ALCANCE: 2"
  private p1Shift!:   Phaser.GameObjects.Text  // "⚡ SHIFT PRONTO" / "⏳ 8.4s"

  // ── P2 panel text objects ─────────────────────────────────────────────────────
  private p2Lives!:   Phaser.GameObjects.Text
  private p2Bombs!:   Phaser.GameObjects.Text
  private p2Range!:   Phaser.GameObjects.Text
  private p2Shift!:   Phaser.GameObjects.Text

  // Solo bar texts
  private soloBar!:   Phaser.GameObjects.Text

  // Banner
  private banner!:    Phaser.GameObjects.Text
  private bannerTween: Phaser.Tweens.Tween | null = null

  // Unsub functions for GameEventBus listeners
  private unsubs: Array<() => void> = []

  constructor() {
    super({ key: 'HUDScene' })
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  create(): void {
    // Read mode and player display names from registry (set by PhaserGame.tsx)
    this.gameMode = (this.game.registry.get('gameMode') as 'solo' | '1v1') ?? 'solo'
    const p1Raw = (this.game.registry.get('player1Name') as string | undefined) ?? 'P1'
    const p2Raw = (this.game.registry.get('player2Name') as string | undefined) ?? 'P2'
    // Truncate long names so they fit in the 240px panel header
    this.p1DisplayName = p1Raw.length > 14 ? p1Raw.slice(0, 13) + '…' : p1Raw
    this.p2DisplayName = p2Raw.length > 14 ? p2Raw.slice(0, 13) + '…' : p2Raw

    this.gfx = this.add.graphics()

    this.buildP1Panel()
    if (this.gameMode === '1v1') this.buildP2Panel()
    this.buildSoloBar()
    this.buildBanner()

    this.subscribeEvents()
  }

  update(_time: number, delta: number): void {
    // Tick cooldowns locally between events (keeps bar smooth at 60fps)
    if (this.p1.shiftCooldownRemainingMs > 0) {
      this.p1.shiftCooldownRemainingMs = Math.max(0, this.p1.shiftCooldownRemainingMs - delta)
    }
    if (this.p2.shiftCooldownRemainingMs > 0) {
      this.p2.shiftCooldownRemainingMs = Math.max(0, this.p2.shiftCooldownRemainingMs - delta)
    }

    this.redraw()
  }

  shutdown(): void {
    for (const u of this.unsubs) u()
    this.unsubs = []
  }

  // ── Panel builders ─────────────────────────────────────────────────────────

  private buildP1Panel(): void {
    const x = PANEL_PAD + 2
    const y = PANEL_Y
    const d = 11  // depth

    // Row 0: name
    this.add.text(x + PANEL_PAD, y + 7, this.p1DisplayName, {
      fontFamily: 'monospace', fontSize: '13px', color: '#00fff7', fontStyle: 'bold',
    }).setDepth(d)

    // Row 1: lives  (y + 7 + 18 = y + 25)
    this.p1Lives = this.add.text(x + PANEL_PAD, y + 25, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff4444',
    }).setDepth(d)

    // Row 2: bombs + range on same line (y + 25 + 16 = y + 41)
    this.p1Bombs = this.add.text(x + PANEL_PAD, y + 41, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#e8e8f0',
    }).setDepth(d)

    this.p1Range = this.add.text(x + PANEL_PAD + 100, y + 41, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#e8e8f0',
    }).setDepth(d)

    // Row 3: shift label (y + 41 + 15 = y + 56 — above the bar)
    this.p1Shift = this.add.text(x + PANEL_PAD, y + 57, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#00fff7',
    }).setDepth(d)
  }

  private buildP2Panel(): void {
    const x = CANVAS_WIDTH - PANEL_W - PANEL_PAD - 2
    const y = PANEL_Y
    const d = 11

    this.add.text(x + PANEL_PAD, y + 7, this.p2DisplayName, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff00cc', fontStyle: 'bold',
    }).setDepth(d)

    this.p2Lives = this.add.text(x + PANEL_PAD, y + 25, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff4444',
    }).setDepth(d)

    this.p2Bombs = this.add.text(x + PANEL_PAD, y + 41, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#e8e8f0',
    }).setDepth(d)

    this.p2Range = this.add.text(x + PANEL_PAD + 100, y + 41, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#e8e8f0',
    }).setDepth(d)

    this.p2Shift = this.add.text(x + PANEL_PAD, y + 57, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff00cc',
    }).setDepth(d)
  }

  private buildSoloBar(): void {
    this.soloBar = this.add.text(CANVAS_WIDTH / 2, 10, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#e8e8f0',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(11)
  }

  private buildBanner(): void {
    this.banner = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60, '', {
      fontFamily: 'monospace', fontSize: '28px', color: '#00fff7',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20).setAlpha(0)
  }

  // ── Redraw ────────────────────────────────────────────────────────────────────

  private redraw(): void {
    this.gfx.clear()

    this.drawPanelBg(PANEL_PAD + 2, C_P1, this.p1)
    this.updatePanelTexts(this.p1Lives, this.p1Bombs, this.p1Range, this.p1Shift, this.p1)

    if (this.gameMode === '1v1') {
      const x = CANVAS_WIDTH - PANEL_W - PANEL_PAD - 2
      this.drawPanelBg(x, C_P2, this.p2)
      this.updatePanelTexts(this.p2Lives, this.p2Bombs, this.p2Range, this.p2Shift, this.p2)
    }

    if (this.gameMode === 'solo') {
      this.soloBar.setText(
        `ONDA ${this.waveNumber}   INIMIGOS ${this.enemyCount}   PONTOS ${this.score.toLocaleString('pt-BR')}`
      )
    }
  }

  private drawPanelBg(x: number, accentColor: number, state: PlayerHUDState): void {
    // Background
    this.gfx.fillStyle(C_PANEL_BG, ALPHA_BG)
    this.gfx.fillRoundedRect(x, PANEL_Y, PANEL_W, PANEL_H, 6)

    // Accent border (dim when dead)
    this.gfx.lineStyle(1.5, accentColor, state.isAlive ? 0.7 : 0.2)
    this.gfx.strokeRoundedRect(x, PANEL_Y, PANEL_W, PANEL_H, 6)

    // Separator line above the shift bar
    const sepY = PANEL_Y + PANEL_H - BAR_H - PANEL_PAD * 2
    this.gfx.lineStyle(1, accentColor, 0.2)
    this.gfx.lineBetween(x + PANEL_PAD, sepY, x + PANEL_W - PANEL_PAD, sepY)

    // SHIFT cooldown bar background
    const barX = x + PANEL_PAD
    const barY = PANEL_Y + BAR_Y_OFF

    this.gfx.fillStyle(C_BAR_BG, 1)
    this.gfx.fillRoundedRect(barX, barY, BAR_W, BAR_H, 3)

    // SHIFT cooldown bar fill
    const { shiftCooldownRemainingMs: remaining, shiftCooldownMs: total } = state
    const fraction = total > 0 ? 1 - remaining / total : 1  // 1 = full/ready
    const fillW = Math.max(0, Math.round(BAR_W * fraction))
    const barColor = fraction >= 1
      ? C_BAR_FULL
      : Phaser.Display.Color.ValueToColor(C_BAR_FULL).darken(30).color
    this.gfx.fillStyle(barColor, state.isAlive ? 1 : 0.3)
    if (fillW > 0) this.gfx.fillRoundedRect(barX, barY, fillW, BAR_H, 3)
  }

  private updatePanelTexts(
    livesText:  Phaser.GameObjects.Text,
    bombsText:  Phaser.GameObjects.Text,
    rangeText:  Phaser.GameObjects.Text,
    shiftText:  Phaser.GameObjects.Text,
    state: PlayerHUDState,
  ): void {
    if (!state.isAlive) {
      livesText.setText('✖ ELIMINADO').setColor('#ff2244')
      bombsText.setText('')
      rangeText.setText('')
      shiftText.setText('')
      return
    }

    // Lives: show hearts up to a max of 5 to avoid overflow
    const hearts = '❤ '.repeat(Math.min(state.lives, 5)).trimEnd()
    livesText.setText(`VIDAS: ${hearts}  (${state.lives})`).setColor('#ff6666')

    bombsText.setText(`💣 ${state.activeBombs}/${state.maxBombs}`)
    rangeText.setText(`↔ ${state.bombRange} casas`)

    // SHIFT status
    const remaining = state.shiftCooldownRemainingMs
    if (remaining > 0) {
      shiftText.setText(`SHIFT ⏳ ${(remaining / 1000).toFixed(1)}s`).setColor('#666688')
    } else {
      shiftText.setText('SHIFT ⚡ PRONTO').setColor('#00fff7')
    }
  }

  // ── Event subscriptions ───────────────────────────────────────────────────────

  private subscribeEvents(): void {
    this.unsubs.push(
      GameEventBus.on(GameEvents.PLAYER_STATS_CHANGED, (p) => this.onPlayerStats(p)),
      GameEventBus.on(GameEvents.PLAYER_DIED, ({ playerId }) => {
        if (playerId === 'p1') this.p1.isAlive = false
        else if (playerId === 'p2') this.p2.isAlive = false
      }),
      GameEventBus.on(GameEvents.SHIFT_USED, ({ playerId }) => {
        const state = playerId === 'p1' ? this.p1 : this.p2
        state.shiftCooldownRemainingMs = state.shiftCooldownMs
      }),
      GameEventBus.on(GameEvents.SHIFT_READY, ({ playerId }) => {
        const state = playerId === 'p1' ? this.p1 : this.p2
        state.shiftCooldownRemainingMs = 0
      }),
      GameEventBus.on(GameEvents.WAVE_START, ({ waveNumber, enemyCount }) => {
        this.waveNumber = waveNumber
        this.enemyCount = enemyCount
        this.showBanner(`ONDA ${waveNumber}`, '#00fff7')
      }),
      GameEventBus.on(GameEvents.WAVE_COMPLETE, ({ waveNumber, score }) => {
        this.score = score
        this.showBanner(`ONDA ${waveNumber} COMPLETA!`, '#00ff88')
      }),
      GameEventBus.on(GameEvents.ARENA_SHIFT_EVENT, () => {
        this.showBanner('⚡ SHIFT EVENT', '#ffe600')
      }),
    )
  }

  private onPlayerStats(p: GameEventPayloads['player:stats_changed']): void {
    const state = p.playerId === 'p1' ? this.p1 : this.p2
    state.activeBombs              = p.activeBombs
    state.maxBombs                 = p.maxBombs
    state.bombRange                = p.bombRange
    state.lives                    = p.lives
    state.shiftCooldownRemainingMs = p.shiftCooldownRemainingMs
    state.shiftCooldownMs          = p.shiftCooldownMs
    // Revive tracking: if lives > 0 but state was marked dead (respawn after damage), re-mark alive
    if (p.lives > 0) state.isAlive = true
  }

  // ── Banner ────────────────────────────────────────────────────────────────────

  private showBanner(text: string, color: string): void {
    if (this.bannerTween) {
      this.bannerTween.stop()
      this.bannerTween = null
    }

    this.banner.setText(text).setColor(color).setAlpha(0).setScale(0.6)

    this.bannerTween = this.tweens.add({
      targets: this.banner,
      alpha:   { from: 0, to: 1 },
      scaleX:  { from: 0.6, to: 1 },
      scaleY:  { from: 0.6, to: 1 },
      duration: 200,
      ease: 'Back.Out',
      onComplete: () => {
        this.bannerTween = this.tweens.add({
          targets:  this.banner,
          alpha:    0,
          delay:    1200,
          duration: 400,
          ease: 'Quad.easeIn',
          onComplete: () => { this.bannerTween = null },
        })
      },
    })
  }
}
