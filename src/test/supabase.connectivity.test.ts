// src/test/supabase.connectivity.test.ts
// Verifies that the Supabase client can reach the configured project.
// This test makes a real network call — it requires .env.local to be populated.
// It intentionally does NOT depend on any application tables existing yet.
//
// What it checks:
//   1. Environment variables are present (configuration check)
//   2. The Supabase project URL is reachable (network check)
//   3. The anon key is accepted by the Auth service (auth check)
//   4. A query against a non-existent table returns a "table not found" error,
//      NOT a network error or an auth error — proving the connection is live
//      and the key is valid.

import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskUrl(url: string): string {
  // Show only the project ref (first subdomain) for logging — never the full key
  try {
    const host = new URL(url).hostname
    const ref = host.split('.')[0]
    return `https://${ref}.supabase.co`
  } catch {
    return '[invalid url]'
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Supabase connectivity', () => {
  const url = import.meta.env.VITE_SUPABASE_URL ?? ''
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

  // ── 1. Configuration check ────────────────────────────────────────────────
  it('VITE_SUPABASE_URL is set and looks like a valid Supabase URL', () => {
    expect(url, 'VITE_SUPABASE_URL must not be empty').toBeTruthy()
    expect(url, 'URL must start with https://').toMatch(/^https:\/\//)
    expect(url, 'URL must contain .supabase.co').toContain('.supabase.co')
    console.info(`[connectivity] Project URL: ${maskUrl(url)}`)
  })

  it('VITE_SUPABASE_ANON_KEY is set and has a plausible format', () => {
    expect(key, 'VITE_SUPABASE_ANON_KEY must not be empty').toBeTruthy()
    // Supabase publishable keys are at least 20 characters
    expect(key.length, 'Key appears too short').toBeGreaterThan(20)
    // Log only the key prefix — never the full value
    console.info(`[connectivity] Key prefix: ${key.slice(0, 8)}…`)
  })

  // ── 2. Network + Auth check ───────────────────────────────────────────────
  it('Supabase REST endpoint responds (network + auth validation)', async () => {
    const client = createClient(url, key)

    // Query a table that certainly does not exist yet.
    // A live connection with a valid key returns PostgREST error code 42P01
    // (undefined_table) — this is a DB-layer error, not a network or auth error.
    // A bad key returns HTTP 401. A network failure throws an exception.
    const { error } = await client.from('__connectivity_probe__').select('id').limit(1)

    if (error) {
      // Classify the error type precisely
      const code = (error as { code?: string }).code
      const status = (error as { status?: number }).status
      const message = error.message ?? ''

      console.info(`[connectivity] Error code: ${code ?? 'none'} | status: ${status ?? 'none'}`)
      console.info(`[connectivity] Error message: ${message}`)

      // 401 = invalid/missing key (auth failure) → test should fail
      expect(
        status,
        `Auth rejected — check VITE_SUPABASE_ANON_KEY.\nError: ${message}`,
      ).not.toBe(401)

      // Network-level failure throws (no status) or gives a fetch error
      expect(
        message,
        'Network error — check VITE_SUPABASE_URL and internet connectivity.',
      ).not.toMatch(/failed to fetch|network error|ENOTFOUND/i)

      // 42P01 = "relation does not exist" — this is the EXPECTED result:
      // it proves we reached the DB layer with valid credentials.
      // Any other Postgres error (42501 = permission, etc.) is also acceptable
      // at this stage since we haven't created tables or RLS policies yet.
      const isDbLayerError =
        code === '42P01' ||    // Postgres: undefined_table
        code === 'PGRST116' || // PostgREST: schema cache miss (no rows)
        code === 'PGRST205' || // PostgREST: table not found in schema cache
        code === 'PGRST200' || // PostgREST: schema not found
        code === '42501' ||    // Postgres: insufficient_privilege
        (status !== undefined && status >= 400 && status < 500 && status !== 401)

      expect(
        isDbLayerError,
        `Unexpected error — not a DB-layer response.\nCode: ${code}\nStatus: ${status}\nMessage: ${message}`,
      ).toBe(true)

      const codeDesc =
        code === 'PGRST205' ? 'schema cache miss (table not yet created — expected)'
        : code === 'PGRST116' ? 'schema cache miss'
        : code === '42P01'   ? 'undefined_table'
        : code === '42501'   ? 'insufficient_privilege'
        : code ?? 'unknown'
      console.info(`[connectivity] ✅ Reached DB layer (${codeDesc}) — project is live and key is accepted.`)
    } else {
      // No error: the table somehow exists and returned data — also fine
      console.info('[connectivity] ✅ Query succeeded (no error).')
    }
  }, 15_000) // 15 s timeout for the network call
})
