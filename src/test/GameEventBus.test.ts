// src/test/GameEventBus.test.ts
// Smoke test: verifies the GameEventBus emits and receives typed events correctly.

import { describe, expect, it, vi } from 'vitest'
import { GameEventBus, GameEvents } from '@/game/GameEventBus'

describe('GameEventBus', () => {
  it('emits and receives a GAME_READY event', () => {
    const listener = vi.fn()
    const unsub = GameEventBus.on(GameEvents.GAME_READY, listener)

    GameEventBus.emit(GameEvents.GAME_READY, {})

    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('does not call listener after unsubscribing', () => {
    const listener = vi.fn()
    const unsub = GameEventBus.on(GameEvents.WAVE_START, listener)
    unsub()

    GameEventBus.emit(GameEvents.WAVE_START, { waveNumber: 1, enemyCount: 2 })

    expect(listener).not.toHaveBeenCalled()
  })

  it('passes the correct payload to the listener', () => {
    const listener = vi.fn()
    const unsub = GameEventBus.on(GameEvents.WAVE_START, listener)

    GameEventBus.emit(GameEvents.WAVE_START, { waveNumber: 3, enemyCount: 4 })

    expect(listener).toHaveBeenCalledWith({ waveNumber: 3, enemyCount: 4 })
    unsub()
  })

  it('emits GAME_OVER with correct solo payload', () => {
    const listener = vi.fn()
    const unsub = GameEventBus.on(GameEvents.GAME_OVER, listener)

    const payload = {
      mode: 'solo' as const,
      score: 1500,
      wavesReached: 3,
      kills: 7,
      totalDurationSeconds: 120,
      waveDurations: [45, 38, 37],
    }
    GameEventBus.emit(GameEvents.GAME_OVER, payload)

    expect(listener).toHaveBeenCalledWith(payload)
    unsub()
  })
})
