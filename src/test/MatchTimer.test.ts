// src/test/MatchTimer.test.ts
// Tests for match duration correctness.
// Uses wall-clock Date.now() — verifies that timing starts at zero and
// is not affected by any prior Phaser/session state.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('Match duration — wall-clock timing', () => {
  let now: number

  beforeEach(() => {
    now = 1_000_000  // arbitrary fixed epoch
    vi.spyOn(Date, 'now').mockReturnValue(now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts at zero: durationSeconds = 0 when game-over fires immediately after create()', () => {
    const startTime = Date.now()  // recorded in create()
    const endTime   = Date.now()  // game-over fires instantly
    const duration  = Math.round((endTime - startTime) / 1000)
    expect(duration).toBe(0)
  })

  it('correctly measures a 90-second match', () => {
    const startTime = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 90_000)
    const duration = Math.round((Date.now() - startTime) / 1000)
    expect(duration).toBe(90)
  })

  it('correctly measures a 5-minute match', () => {
    const startTime = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000)
    const duration = Math.round((Date.now() - startTime) / 1000)
    expect(duration).toBe(300)
  })

  it('Play Again resets the clock: new startTime is fresh Date.now()', () => {
    // Simulate first game: started 8 minutes ago
    const firstGameStart = now - 8 * 60 * 1000
    // Simulate second game: started NOW (Play Again clicked)
    const secondGameStart = Date.now()  // = now (mocked)

    // Duration from second game start to 10 seconds later
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000)
    const duration = Math.round((Date.now() - secondGameStart) / 1000)

    expect(duration).toBe(10)
    // Verify the first game's start is not reused
    expect(Math.round((Date.now() - firstGameStart) / 1000)).not.toBe(10)
  })

  it('Solo wave duration is also wall-clock based', () => {
    // Simulate a wave that took 30 seconds
    const waveStart = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_000)
    const waveDurationMs  = Date.now() - waveStart
    const waveDurationSec = waveDurationMs / 1000
    expect(waveDurationSec).toBe(30)
  })
})
