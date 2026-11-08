-- =============================================================================
-- Migration 003: pvp_matches  (revised)
-- BOMB//SHIFT — ST-02 Part 1
--
-- Changes from original:
--   • Public read replaced with owner-only read (match history is private).
--   • Explicit GRANT SELECT for authenticated users (own rows via RLS).
--   • duration_seconds upper bound added: 1v1 arena time cap = 1800 s (30 min).
--   • player2_name: DB CHECK still validates post-trim length (1–20 chars).
--     Note: trim() cannot be applied inside a CHECK constraint portably; the Edge
--     Function strips whitespace before submission. The DB constraint checks the
--     final stored value, which has already been trimmed.
-- =============================================================================

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pvp_matches (
  -- Identity
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_uuid  uuid        NOT NULL UNIQUE,  -- UUID v4, idempotency key

  -- Ownership (only player1 is authenticated)
  player1_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Guest opponent name — trimmed and validated by Edge Function before insert.
  -- The CHECK here enforces the stored (already-trimmed) value is 1–20 chars.
  player2_name text       NOT NULL
                          CHECK (char_length(player2_name) BETWEEN 1 AND 20),

  -- Match outcome from player1's perspective
  result      public.pvp_result NOT NULL,

  -- Duration: > 0 and capped at 1800 s (30 min — generous upper bound for 1v1).
  duration_seconds integer NOT NULL
                   CHECK (duration_seconds > 0 AND duration_seconds <= 1800),

  -- Timestamp
  played_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.pvp_matches              IS 'One row per completed 1v1 Local match, from player1 perspective.';
COMMENT ON COLUMN public.pvp_matches.match_uuid   IS 'UUID v4 — idempotency key.';
COMMENT ON COLUMN public.pvp_matches.player2_name IS 'Guest name, 1–20 chars (already trimmed by Edge Function).';
COMMENT ON COLUMN public.pvp_matches.result       IS 'win | loss | draw — always from player1 perspective.';
COMMENT ON COLUMN public.pvp_matches.duration_seconds IS 'Match duration in seconds, 1–1800.';

-- ── Explicit GRANTs ───────────────────────────────────────────────────────────

GRANT SELECT ON public.pvp_matches TO authenticated;
-- anon gets no access: match history is not public.

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.pvp_matches ENABLE ROW LEVEL SECURITY;

-- Owner-only read: player1 may query only their own match history.
-- The rankings RPC (migration 006) uses SECURITY DEFINER and reads all rows
-- server-side — it does not depend on this policy.
CREATE POLICY "pvp_matches: owner read"
  ON public.pvp_matches
  FOR SELECT
  USING (auth.uid() = player1_id);

-- ── DENY all client writes ────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE ON public.pvp_matches FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pvp_matches FROM authenticated;
-- Service role (Edge Functions) bypasses RLS — it retains full access.
