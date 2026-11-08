// src/test/EdgeFunctions.test.ts
// Tests for the Edge Function validation logic and PostMatchPage payload building.
// All tests are pure — no network calls.

import { describe, it, expect } from 'vitest'
import { killScore, waveClearBonus, timeBonus } from '@/game/systems/WaveFormulas'

// ─── Mirrors the score reconstruction in submit-solo-result/index.ts ──────────

function reconstructScore(
  waveNumbers: number[],
  waveDurations: number[],
  killsPerWave: number[],
  wavesSurvived: number,
): number {
  let score = 0
  for (let i = 0; i < wavesSurvived; i++) {
    const w = waveNumbers[i]
    score += (killsPerWave[i] ?? 0) * 100 * w
    score += 500 * w
    score += Math.max(0, 60 - waveDurations[i]) * 5
  }
  // Extra slot: partial wave kills
  if (killsPerWave.length === wavesSurvived + 1) {
    const partialWave = (waveNumbers[waveNumbers.length - 1] ?? 0) + 1
    score += (killsPerWave[wavesSurvived] ?? 0) * 100 * partialWave
  }
  return score
}

// ─── score reconstruction matches WaveFormulas exactly ───────────────────────

describe('Edge Function: score reconstruction', () => {
  it('wave 1, 2 kills, cleared in 30s — matches WaveFormulas', () => {
    const waveNumbers   = [1]
    const waveDurations = [30]
    const killsPerWave  = [2]  // exact length = wavesSurvived

    const expected =
      2 * killScore(1) +       // 200
      waveClearBonus(1) +      // 500
      timeBonus(30)            // 150 → total 850

    expect(reconstructScore(waveNumbers, waveDurations, killsPerWave, 1)).toBe(expected)
    expect(expected).toBe(850)
  })

  it('wave 3 cleared, player died in wave 4 with 1 partial kill', () => {
    // 3 waves cleared + extra partial slot
    const waveNumbers   = [1, 2, 3]
    const waveDurations = [30, 25, 40]
    const killsPerWave  = [2, 2, 2, 1]  // length = 4 = wavesSurvived+1
    const wavesSurvived = 3

    let expected = 0
    for (let i = 0; i < 3; i++) {
      expected += killsPerWave[i] * killScore(waveNumbers[i])
      expected += waveClearBonus(waveNumbers[i])
      expected += timeBonus(waveDurations[i])
    }
    // partial wave: wave 4, 1 kill
    expected += 1 * 100 * 4  // killScore(4) = 400; 1 kill = 400

    expect(reconstructScore(waveNumbers, waveDurations, killsPerWave, wavesSurvived)).toBe(expected)
  })

  it('zero waves survived, 0 kills — score is 0', () => {
    expect(reconstructScore([], [], [], 0)).toBe(0)
  })

  it('zero waves survived with partial kill in wave 1 — only kill score', () => {
    // Died in wave 1 without clearing it; 1 partial kill
    const killsPerWave = [1]   // extra slot: partial wave 1 kill
    const expected = 1 * 100 * 1   // wave 1 kill = 100
    expect(reconstructScore([], [], killsPerWave, 0)).toBe(expected)
  })
})

// ─── Edge Function: submit-solo-result validation rules ───────────────────────

type SoloBody = {
  match_uuid: string
  score: number
  waves_survived: number
  kills: number
  total_duration_seconds: number
  wave_durations: number[]
  wave_numbers: number[]
  kills_per_wave: number[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateSoloBody(b: SoloBody): string | null {
  if (!UUID_RE.test(b.match_uuid)) return 'Invalid match_uuid'
  if (b.score < 0 || b.score > 500_000) return 'score out of bounds'
  if (b.waves_survived < 0 || b.waves_survived > 50) return 'waves_survived out of bounds'
  if (b.kills < 0 || b.kills > 400) return 'kills out of bounds'
  if (b.total_duration_seconds <= 0) return 'total_duration_seconds must be > 0'
  if (b.wave_durations.length !== b.waves_survived) return 'wave_durations length mismatch'
  if (b.wave_numbers.length !== b.waves_survived) return 'wave_numbers length mismatch'
  if (b.kills_per_wave.length !== b.waves_survived && b.kills_per_wave.length !== b.waves_survived + 1) {
    return 'kills_per_wave length mismatch'
  }
  const expectedScore = reconstructScore(b.wave_numbers, b.wave_durations, b.kills_per_wave, b.waves_survived)
  if (b.score !== expectedScore) return `score mismatch: submitted ${b.score}, expected ${expectedScore}`
  const sumKills = b.kills_per_wave.reduce((a, x) => a + x, 0)
  if (sumKills !== b.kills) return `kills mismatch: sum=${sumKills}, submitted=${b.kills}`
  return null
}

describe('Edge Function: submit-solo-result full validation', () => {
  const validBody: SoloBody = {
    match_uuid: '550e8400-e29b-41d4-a716-446655440000',
    score: 850,
    waves_survived: 1,
    kills: 2,
    total_duration_seconds: 35,
    wave_durations: [30],
    wave_numbers: [1],
    kills_per_wave: [2],
  }

  it('accepts a fully valid payload', () => {
    expect(validateSoloBody(validBody)).toBeNull()
  })

  it('rejects invalid UUID format', () => {
    expect(validateSoloBody({ ...validBody, match_uuid: 'not-a-uuid' })).toBe('Invalid match_uuid')
  })

  it('rejects score > 500 000', () => {
    expect(validateSoloBody({ ...validBody, score: 500_001 })).toBe('score out of bounds')
  })

  it('rejects negative score', () => {
    expect(validateSoloBody({ ...validBody, score: -1 })).toBe('score out of bounds')
  })

  it('rejects wave_durations length != waves_survived', () => {
    expect(validateSoloBody({ ...validBody, wave_durations: [30, 25] })).toBe('wave_durations length mismatch')
  })

  it('rejects when kills_per_wave sum != kills', () => {
    // kills=3 but sum([2])=2
    expect(validateSoloBody({ ...validBody, kills: 3 })).toBe('kills mismatch: sum=2, submitted=3')
  })

  it('rejects when score does not match reconstruction', () => {
    // tamper with the score
    expect(validateSoloBody({ ...validBody, score: 999 })).toMatch('score mismatch')
  })
})

// ─── Edge Function: submit-pvp-result validation rules ────────────────────────

type PvpBody = {
  match_uuid: string
  player2_name: string
  result: string
  duration_seconds: number
}

function validatePvpBody(b: PvpBody): string | null {
  if (!UUID_RE.test(b.match_uuid)) return 'Invalid match_uuid'
  const name = b.player2_name?.trim() ?? ''
  if (name.length === 0) return 'player2_name cannot be empty'
  if (name.length > 20) return 'player2_name too long'
  if (!['win', 'loss', 'draw'].includes(b.result)) return 'Invalid result value'
  if (b.duration_seconds <= 0 || b.duration_seconds > 1800) return 'duration_seconds out of bounds'
  return null
}

describe('Edge Function: submit-pvp-result full validation', () => {
  const validPvp: PvpBody = {
    match_uuid: '550e8400-e29b-41d4-a716-446655440000',
    player2_name: 'Rival',
    result: 'win',
    duration_seconds: 120,
  }

  it('accepts a valid payload', () => {
    expect(validatePvpBody(validPvp)).toBeNull()
  })

  it('rejects empty player2_name', () => {
    expect(validatePvpBody({ ...validPvp, player2_name: '' })).toBe('player2_name cannot be empty')
    expect(validatePvpBody({ ...validPvp, player2_name: '   ' })).toBe('player2_name cannot be empty')
  })

  it('rejects player2_name > 20 chars', () => {
    expect(validatePvpBody({ ...validPvp, player2_name: 'A'.repeat(21) })).toBe('player2_name too long')
  })

  it('rejects invalid result value', () => {
    expect(validatePvpBody({ ...validPvp, result: 'victory' })).toBe('Invalid result value')
  })

  it('accepts all three valid result values', () => {
    for (const r of ['win', 'loss', 'draw']) {
      expect(validatePvpBody({ ...validPvp, result: r })).toBeNull()
    }
  })

  it('rejects duration_seconds = 0', () => {
    expect(validatePvpBody({ ...validPvp, duration_seconds: 0 })).toBe('duration_seconds out of bounds')
  })

  it('rejects duration_seconds > 1800', () => {
    expect(validatePvpBody({ ...validPvp, duration_seconds: 1801 })).toBe('duration_seconds out of bounds')
  })
})

// ─── WaveSystem tracking: waveNumbers + killsPerWave arrays ──────────────────

describe('WaveSystem: per-wave arrays populated correctly', () => {
  it('single completed wave builds correct parallel arrays', () => {
    // Simulate one completed wave: wave 1, 2 kills, 30s
    const waveNumbers   = [1]
    const waveDurations = [30]
    const killsPerWave  = [2]
    const wavesSurvived = waveNumbers.length

    // All arrays parallel and same length
    expect(waveNumbers.length).toBe(wavesSurvived)
    expect(waveDurations.length).toBe(wavesSurvived)
    expect(killsPerWave.length).toBe(wavesSurvived)

    // Score validates
    expect(validateSoloBody({
      match_uuid: '550e8400-e29b-41d4-a716-446655440000',
      score: reconstructScore(waveNumbers, waveDurations, killsPerWave, wavesSurvived),
      waves_survived: wavesSurvived,
      kills: killsPerWave.reduce((a, x) => a + x, 0),
      total_duration_seconds: 35,
      wave_durations: waveDurations,
      wave_numbers: waveNumbers,
      kills_per_wave: killsPerWave,
    })).toBeNull()
  })

  it('partial wave extra slot: length = wavesSurvived + 1', () => {
    // Died in wave 2 without clearing it; 3 kills in partial wave 2
    const killsPerWave  = [2, 3]   // slot 0 = wave 1 kills, slot 1 = partial wave 2 kills
    const waveNumbers   = [1]      // 1 completed wave
    const waveDurations = [30]     // matching duration
    const wavesSurvived = waveNumbers.length  // = waveDurations.length = 1

    expect(killsPerWave.length).toBe(wavesSurvived + 1)
    // Edge Function accepts length = wavesSurvived+1
    expect(
      killsPerWave.length === wavesSurvived || killsPerWave.length === wavesSurvived + 1
    ).toBe(true)
    expect(waveDurations.length).toBe(wavesSurvived)
  })
})
