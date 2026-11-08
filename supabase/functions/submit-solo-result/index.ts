// supabase/functions/submit-solo-result/index.ts
// Edge Function: POST /functions/v1/submit-solo-result
//
// Receives a completed Solo run result, verifies the score arithmetic,
// and inserts a row into public.solo_matches using the service role (bypasses RLS).
//
// Security:
//   - player_id is taken from the JWT (auth.uid()), never from the request body.
//   - Score is reconstructed server-side and must equal the submitted value exactly.
//   - Idempotency: duplicate match_uuid returns 200 with the existing row (no second insert).
//
// Request body (JSON):
//   match_uuid          string   UUID v4
//   score               number   0–500 000
//   waves_survived      number   0–50 (completed waves)
//   kills               number   0–400
//   total_duration_seconds number > 0
//   wave_durations      number[] seconds per completed wave; length = waves_survived
//   wave_numbers        number[] 1-based wave index per completed wave; same length
//   kills_per_wave      number[] kills per slot; length = waves_survived or +1 (partial)
//
// Responses:
//   200  { id, match_uuid }       — inserted (or existing, idempotent)
//   400  { error: string }        — validation failure
//   401  { error: "Unauthorized" } — missing/invalid JWT
//   403  { error: "Forbidden" }   — JWT uid ≠ player_id (unused — body player_id ignored)
//   500  { error: string }        — unexpected DB error

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Auth: extract JWT and get authenticated user ───────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!

  // Use anon client with the user's JWT to verify their identity
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const playerId = user.id  // authoritative — never from body

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const b = body as Record<string, unknown>

  // ── Validate required fields ───────────────────────────────────────────────
  if (typeof b.match_uuid !== 'string' || !UUID_RE.test(b.match_uuid)) {
    return json({ error: 'Invalid match_uuid (must be UUID v4)' }, 400)
  }
  if (typeof b.score !== 'number' || !Number.isInteger(b.score) || b.score < 0 || b.score > 500_000) {
    return json({ error: 'score must be an integer 0–500 000' }, 400)
  }
  if (typeof b.waves_survived !== 'number' || !Number.isInteger(b.waves_survived) || b.waves_survived < 0 || b.waves_survived > 50) {
    return json({ error: 'waves_survived must be an integer 0–50' }, 400)
  }
  if (typeof b.kills !== 'number' || !Number.isInteger(b.kills) || b.kills < 0 || b.kills > 400) {
    return json({ error: 'kills must be an integer 0–400' }, 400)
  }
  if (typeof b.total_duration_seconds !== 'number' || !Number.isInteger(b.total_duration_seconds) || b.total_duration_seconds <= 0) {
    return json({ error: 'total_duration_seconds must be a positive integer' }, 400)
  }
  if (!Array.isArray(b.wave_durations) || b.wave_durations.some(x => typeof x !== 'number' || x < 0)) {
    return json({ error: 'wave_durations must be a non-negative integer array' }, 400)
  }
  if (!Array.isArray(b.wave_numbers) || b.wave_numbers.some(x => typeof x !== 'number' || x < 1)) {
    return json({ error: 'wave_numbers must be a positive integer array (1-based)' }, 400)
  }
  if (!Array.isArray(b.kills_per_wave) || b.kills_per_wave.some(x => typeof x !== 'number' || x < 0)) {
    return json({ error: 'kills_per_wave must be a non-negative integer array' }, 400)
  }

  const wavesSurvived: number   = b.waves_survived as number
  const waveDurations: number[] = b.wave_durations as number[]
  const waveNumbers: number[]   = b.wave_numbers   as number[]
  const killsPerWave: number[]  = b.kills_per_wave as number[]

  // ── Length checks ─────────────────────────────────────────────────────────
  if (waveDurations.length !== wavesSurvived) {
    return json({ error: `wave_durations length (${waveDurations.length}) must equal waves_survived (${wavesSurvived})` }, 400)
  }
  if (waveNumbers.length !== wavesSurvived) {
    return json({ error: `wave_numbers length (${waveNumbers.length}) must equal waves_survived (${wavesSurvived})` }, 400)
  }
  if (killsPerWave.length !== wavesSurvived && killsPerWave.length !== wavesSurvived + 1) {
    return json({ error: `kills_per_wave length must be waves_survived (${wavesSurvived}) or waves_survived+1 (partial wave)` }, 400)
  }
  if (waveNumbers.length > 50 || waveDurations.length > 50 || killsPerWave.length > 51) {
    return json({ error: 'Array too long' }, 400)
  }

  // ── Score reconstruction ──────────────────────────────────────────────────
  // Recalculate expected score from wave data. Must match submitted score exactly.
  let expectedScore = 0
  for (let i = 0; i < wavesSurvived; i++) {
    const w = waveNumbers[i]
    // Kill score for completed wave (100 × wave)
    expectedScore += (killsPerWave[i] ?? 0) * 100 * w
    // Wave-clear bonus (500 × wave)
    expectedScore += 500 * w
    // Time bonus: max(0, 60 - duration_seconds) × 5
    expectedScore += Math.max(0, 60 - waveDurations[i]) * 5
  }
  // Extra slot: kills in the final partial wave (if present)
  if (killsPerWave.length === wavesSurvived + 1) {
    const lastCompletedWave = waveNumbers[waveNumbers.length - 1] ?? 0
    const partialWave = lastCompletedWave + 1
    expectedScore += (killsPerWave[wavesSurvived] ?? 0) * 100 * partialWave
  }

  if ((b.score as number) !== expectedScore) {
    return json({ error: `Score mismatch: submitted ${b.score}, expected ${expectedScore}` }, 400)
  }

  // ── Kills verification ────────────────────────────────────────────────────
  const totalKills = killsPerWave.reduce((a, x) => a + x, 0)
  if (totalKills !== (b.kills as number)) {
    return json({ error: `kills mismatch: SUM(kills_per_wave)=${totalKills}, kills=${b.kills}` }, 400)
  }

  // ── Idempotency check: return existing row if match_uuid already exists ────
  const serviceClient = createClient(supabaseUrl, serviceKey)
  const { data: existing } = await serviceClient
    .from('solo_matches')
    .select('id, match_uuid')
    .eq('match_uuid', b.match_uuid)
    .maybeSingle()

  if (existing) {
    return json({ id: existing.id, match_uuid: existing.match_uuid, idempotent: true }, 200)
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await serviceClient
    .from('solo_matches')
    .insert({
      match_uuid:            b.match_uuid,
      player_id:             playerId,          // from JWT — not from body
      score:                 b.score,
      waves_survived:        wavesSurvived,
      kills:                 b.kills,
      total_duration_seconds: b.total_duration_seconds,
      wave_durations:        waveDurations,
      wave_numbers:          waveNumbers,
      kills_per_wave:        killsPerWave,
    })
    .select('id, match_uuid')
    .single()

  if (insertError) {
    console.error('Insert error:', insertError)
    return json({ error: 'Database error' }, 500)
  }

  return json({ id: inserted!.id, match_uuid: inserted!.match_uuid }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
