// supabase/functions/submit-pvp-result/index.ts
// Edge Function: POST /functions/v1/submit-pvp-result
//
// Receives a completed 1v1 Local match result and inserts into public.pvp_matches.
// player1_id is extracted from the JWT — never trusted from the body.
//
// Request body (JSON):
//   match_uuid     string   UUID v4
//   player2_name   string   1–20 chars (trimmed)
//   result         string   'win' | 'loss' | 'draw'
//   duration_seconds number  1–1800
//
// Responses:
//   200  { id, match_uuid }        — inserted or existing (idempotent)
//   400  { error: string }         — validation failure
//   401  { error: "Unauthorized" } — missing/invalid JWT
//   500  { error: string }         — DB error

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_RESULTS = new Set(['win', 'loss', 'draw'])

Deno.serve(async (req: Request) => {
  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const player1Id = user.id  // authoritative

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const b = body as Record<string, unknown>

  // ── Validate ───────────────────────────────────────────────────────────────
  if (typeof b.match_uuid !== 'string' || !UUID_RE.test(b.match_uuid)) {
    return json({ error: 'Invalid match_uuid (must be UUID v4)' }, 400)
  }

  if (typeof b.player2_name !== 'string') {
    return json({ error: 'player2_name is required' }, 400)
  }
  const player2Name = b.player2_name.trim()
  if (player2Name.length === 0) {
    return json({ error: 'player2_name cannot be empty' }, 400)
  }
  if (player2Name.length > 20) {
    return json({ error: 'player2_name must be 1–20 characters' }, 400)
  }

  if (typeof b.result !== 'string' || !VALID_RESULTS.has(b.result)) {
    return json({ error: 'result must be "win", "loss", or "draw"' }, 400)
  }

  if (
    typeof b.duration_seconds !== 'number' ||
    !Number.isInteger(b.duration_seconds) ||
    b.duration_seconds <= 0 ||
    b.duration_seconds > 1800
  ) {
    return json({ error: 'duration_seconds must be a positive integer ≤ 1800' }, 400)
  }

  // ── Idempotency ────────────────────────────────────────────────────────────
  const serviceClient = createClient(supabaseUrl, serviceKey)
  const { data: existing } = await serviceClient
    .from('pvp_matches')
    .select('id, match_uuid')
    .eq('match_uuid', b.match_uuid)
    .maybeSingle()

  if (existing) {
    return json({ id: existing.id, match_uuid: existing.match_uuid, idempotent: true }, 200)
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await serviceClient
    .from('pvp_matches')
    .insert({
      match_uuid:       b.match_uuid,
      player1_id:       player1Id,     // from JWT — not from body
      player2_name:     player2Name,
      result:           b.result,
      duration_seconds: b.duration_seconds,
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
