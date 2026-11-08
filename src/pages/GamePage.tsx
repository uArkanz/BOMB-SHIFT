// src/pages/GamePage.tsx
// Mounts the Phaser game canvas with decorative side panels (arcade/cyberpunk style).
// Listens for GAME_OVER via GameEventBus; navigates to PostMatchPage with result.
// Music: switches to game BGM on mount; restores menu BGM on unmount.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { PhaserGame } from '@/game/PhaserGame'
import { GameEventBus, GameEvents } from '@/game/GameEventBus'
import { useAuth } from '@/hooks/useAuth'
import { audioManager } from '@/game/audio/AudioManager'
import type { GameEventPayloads } from '@/game/GameEventBus'
import styles from './GamePage.module.css'

type GameMode = 'solo' | '1v1'
type ThemeName = 'neon' | 'void' | 'critical'

// Theme cycle matches ArenaThemeManager order: NEON → VOID → CRITICAL → NEON…
const THEME_CYCLE: ThemeName[] = ['neon', 'void', 'critical']

function isValidMode(m: string | undefined): m is GameMode {
  return m === 'solo' || m === '1v1'
}

// ── Left panel ────────────────────────────────────────────────────────────────

function LeftPanel({ mode, player1Name, theme }: { mode: GameMode; player1Name: string; theme: ThemeName }) {
  return (
    <aside className={`${styles.panel} ${styles.panelLeft} ${styles[`theme_${theme}`]}`} aria-hidden="true">
      <div className={styles.panelInner}>
        {/* Logo */}
        <div className={styles.logo}>
          <span className={styles.logoLine1}>BOMB</span>
          <span className={styles.logoDivider}>//</span>
          <span className={styles.logoLine2}>SHIFT</span>
        </div>

        <div className={styles.modeBadge}>
          {mode === '1v1' ? '⚔ PVP 1v1' : '◈ SOLO'}
        </div>

        <hr className={styles.divider} />

        {/* Player 1 skin */}
        <div className={styles.playerCard}>
          <img
            src="/assets/images/player1-cyan.png"
            alt="P1"
            className={styles.playerSprite}
          />
          <span className={styles.playerName}>{player1Name}</span>
          <span className={styles.playerTag}>JOGADOR 1</span>
        </div>

        <hr className={styles.divider} />

        {/* Controls */}
        <div className={styles.controlsBlock}>
          <div className={styles.controlsTitle}>CONTROLES</div>
          <div className={styles.keyRow}>
            <kbd className={styles.key}>W</kbd><kbd className={styles.key}>A</kbd>
            <kbd className={styles.key}>S</kbd><kbd className={styles.key}>D</kbd>
            <span className={styles.keyLabel}>mover</span>
          </div>
          <div className={styles.keyRow}>
            <kbd className={styles.keyWide}>SPACE</kbd>
            <span className={styles.keyLabel}>bomba</span>
          </div>
          <div className={styles.keyRow}>
            <kbd className={styles.keyWide}>L-SHIFT</kbd>
            <span className={styles.keyLabel}>shift</span>
          </div>
        </div>

        <div className={styles.scanline} />
        <div className={styles.cornerDot} />
      </div>
    </aside>
  )
}

// ── Right panel ───────────────────────────────────────────────────────────────

function RightPanel({ mode, player2Name, theme }: { mode: GameMode; player2Name: string; theme: ThemeName }) {
  if (mode === '1v1') {
    return (
      <aside className={`${styles.panel} ${styles.panelRight} ${styles[`theme_${theme}`]}`} aria-hidden="true">
        <div className={styles.panelInner}>
          <div className={styles.playerCard}>
            <img
              src="/assets/images/player2-magenta.png"
              alt="P2"
              className={`${styles.playerSprite} ${styles.playerSpriteRight}`}
            />
            <span className={`${styles.playerName} ${styles.playerNameRight}`}>{player2Name}</span>
            <span className={styles.playerTag}>JOGADOR 2</span>
          </div>

          <hr className={styles.divider} />

          <div className={styles.controlsBlock}>
            <div className={`${styles.controlsTitle} ${styles.controlsTitleRight}`}>CONTROLES</div>
            <div className={styles.keyRow}>
              <kbd className={`${styles.key} ${styles.keyRight}`}>↑</kbd>
              <kbd className={`${styles.key} ${styles.keyRight}`}>←</kbd>
              <kbd className={`${styles.key} ${styles.keyRight}`}>↓</kbd>
              <kbd className={`${styles.key} ${styles.keyRight}`}>→</kbd>
              <span className={styles.keyLabel}>mover</span>
            </div>
            <div className={styles.keyRow}>
              <kbd className={`${styles.keyWide} ${styles.keyRight}`}>ENTER</kbd>
              <span className={styles.keyLabel}>bomba</span>
            </div>
            <div className={styles.keyRow}>
              <kbd className={`${styles.keyWide} ${styles.keyRight}`}>R-SHIFT</kbd>
              <span className={styles.keyLabel}>shift</span>
            </div>
          </div>

          <div className={styles.scanline} />
          <div className={styles.cornerDot} />
        </div>
      </aside>
    )
  }

  // Solo: dicas do modo
  return (
    <aside className={`${styles.panel} ${styles.panelRight} ${styles[`theme_${theme}`]}`} aria-hidden="true">
      <div className={styles.panelInner}>
        <div className={`${styles.controlsTitle} ${styles.controlsTitleRight}`}>MODO SOLO</div>

        <div className={styles.tipsList}>
          <div className={styles.tip}>◈ Sobreviva às ondas de inimigos</div>
          <div className={styles.tip}>⚡ SHIFT teleporta para célula livre</div>
          <div className={styles.tip}>💣 Destrói blocos para abrir caminho</div>
          <div className={styles.tip}>↔ Aumente alcance destruindo blocos</div>
          <div className={styles.tip}>⚠ Atenção ao SHIFT EVENT da arena</div>
        </div>

        <hr className={styles.divider} />

        <div className={styles.enemyGuide}>
          <div className={`${styles.controlsTitle} ${styles.controlsTitleRight}`}>INIMIGOS</div>
          <div className={styles.enemyRow}>
            <img src="/assets/images/enemy-grunt.png" alt="Grunt" className={styles.enemySprite} />
            <span>GRUNT — persegue</span>
          </div>
          <div className={styles.enemyRow}>
            <img src="/assets/images/enemy-chaser.png" alt="Chaser" className={styles.enemySprite} />
            <span>CHASER — rápido</span>
          </div>
          <div className={styles.enemyRow}>
            <img src="/assets/images/enemy-tactician.png" alt="Tactician" className={styles.enemySprite} />
            <span>TACTICIAN — planta bombas</span>
          </div>
        </div>

        <div className={styles.scanline} />
        <div className={styles.cornerDot} />
      </div>
    </aside>
  )
}

// ── GamePage ──────────────────────────────────────────────────────────────────

export function GamePage() {
  const { mode } = useParams<{ mode: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const navigatedRef = useRef(false)
  const { profile } = useAuth()

  const player1Name = profile?.username ?? 'P1'
  const player2Name = (location.state as { player2Name?: string } | null)?.player2Name ?? 'P2'

  // Track current arena theme (cycles with ARENA_SHIFT_EVENT, starts at neon)
  const [themeIdx, setThemeIdx] = useState(0)
  const theme = THEME_CYCLE[themeIdx % THEME_CYCLE.length]

  useEffect(() => {
    audioManager.startGameMusic()
    return () => { audioManager.startMenuMusic() }
  }, [])

  useEffect(() => {
    const unsubTheme = GameEventBus.on(GameEvents.ARENA_SHIFT_EVENT, () => {
      setThemeIdx(prev => prev + 1)
    })
    return () => unsubTheme()
  }, [])

  useEffect(() => {
    navigatedRef.current = false

    const unsub = GameEventBus.on(GameEvents.GAME_OVER, (payload: GameEventPayloads['game:over']) => {
      if (navigatedRef.current) return
      navigatedRef.current = true

      navigate('/post-match', {
        replace: true,
        state: {
          result: payload,
          player1Name,
          player2Name,
          mode,
        },
      })
    })

    return () => unsub()
  }, [navigate, player2Name, mode])

  if (!isValidMode(mode)) {
    navigate('/play', { replace: true })
    return null
  }

  return (
    <div className={styles.wrapper}>
      <LeftPanel mode={mode} player1Name={player1Name} theme={theme} />

      <div className={styles.canvasArea}>
        <div className={`${styles.arenaGlow} ${styles[`glow_${theme}`]}`} />
        <PhaserGame mode={mode} player1Name={player1Name} player2Name={player2Name} />
      </div>

      <RightPanel mode={mode} player2Name={player2Name} theme={theme} />

      <button
        className={styles.backBtn}
        onClick={() => navigate('/play')}
        title="Voltar ao menu de modos"
        aria-label="Voltar"
      >
        ←
      </button>
    </div>
  )
}
