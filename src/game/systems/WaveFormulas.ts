// src/game/systems/WaveFormulas.ts
// Pure wave progression formulas — no Phaser dependency; safe to unit-test.
// Extracted from WaveSystem.ts so tests don't pull in Phaser.

export interface WaveSpec {
  grunts: number
  chasers: number
  tacticians: number
}

/**
 * Returns the enemy composition for a given wave number,
 * following the exact canonical formula from bombshift-plan.md ST-09.
 */
export function waveSpec(waveNumber: number): WaveSpec {
  if (waveNumber === 1) return { grunts: 2, chasers: 0, tacticians: 0 }
  if (waveNumber === 2) return { grunts: 2, chasers: 1, tacticians: 0 }
  if (waveNumber === 3) return { grunts: 2, chasers: 2, tacticians: 0 }
  if (waveNumber === 4) return { grunts: 2, chasers: 1, tacticians: 1 }
  // Wave 5+: N = min(6, waveNumber - 4) tacticians; chasers phased out
  const N = Math.min(6, waveNumber - 4)
  return { grunts: 2, chasers: 0, tacticians: N }
}

/** Total enemies for a wave spec (hard cap of 8). */
export function totalEnemies(spec: WaveSpec): number {
  return Math.min(8, spec.grunts + spec.chasers + spec.tacticians)
}

/** Kill score per enemy. */
export function killScore(waveNumber: number): number {
  return 100 * waveNumber
}

/** Wave-clear bonus (only if all enemies eliminated). */
export function waveClearBonus(waveNumber: number): number {
  return 500 * waveNumber
}

/** Per-wave time bonus. */
export function timeBonus(waveDurationSeconds: number): number {
  return Math.max(0, 60 - waveDurationSeconds) * 5
}
