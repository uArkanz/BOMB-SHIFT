// src/game/PhaserGame.tsx
// React component that owns the Phaser 3 game instance lifecycle.
// - Mounts: creates the Phaser.Game and attaches it to a div ref.
// - Unmounts: calls game.destroy(true) to clean up the canvas and all listeners.
// This component never re-renders after mounting — Phaser manages its own DOM node.

import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import { buildPhaserConfig } from './config'

interface PhaserGameProps {
  /** 'solo' or '1v1' — passed to Phaser via the event bus after mount */
  mode?: 'solo' | '1v1'
  /** Display name for P1 (authenticated user's username). Fallback: 'P1'. */
  player1Name?: string
  /** Display name for P2 (guest name from PreMatchPage). Fallback: 'P2'. */
  player2Name?: string
}

export function PhaserGame({ mode, player1Name, player2Name }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (gameRef.current) return // already mounted (StrictMode double-invoke guard)

    const config = buildPhaserConfig(containerRef.current)
    gameRef.current = new Phaser.Game(config)

    // Store mode and player display names in Phaser registry immediately — before any scene runs.
    // PreloadScene reads mode and passes it to scene.start('GameScene', { mode }).
    // HUDScene reads player names for panel labels.
    if (mode) {
      gameRef.current.registry.set('gameMode', mode)
    }
    gameRef.current.registry.set('player1Name', player1Name ?? 'P1')
    gameRef.current.registry.set('player2Name', player2Name ?? 'P2')

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [mode])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
      }}
    />
  )
}
