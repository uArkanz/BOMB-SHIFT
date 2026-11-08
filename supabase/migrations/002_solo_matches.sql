-- =============================================================================
-- Migration 002: solo_matches  (revised v2)
-- BOMB//SHIFT — ST-02 Part 1
--
-- Changes from v1:
--   • Added kills_per_wave integer[]: kills per wave slot, including the
--     final incomplete wave if the player died mid-wave.
--   • Added array size CHECK for kills_per_wave (max 51 = 50 waves + 1 partial).
--   • Documented the array relationship contract and Edge Function recalc logic.
--
-- ── Array relationship contract ───────────────────────────────────────────────
--
--   wave_numbers[i]     1-based index of the i-th completed wave (i=1..waves_survived).
--   wave_durations[i]   Duration (s) of wave_numbers[i]. Completed waves only.
--   kills_per_wave[i]   Kills scored in wave wave_numbers[i]. Same length as wave_numbers.
--   kills_per_wave[waves_survived+1]
--                       Kills scored in the final incomplete wave (extra slot).
--                       Present when the player died before completing that wave.
--                       Absent when the run ended exactly on a wave boundary.
--   kills               Total kills = SUM(kills_per_wave). Verified by Edge Function.
--   waves_survived      Completed waves = length(wave_numbers). 0 is valid.
--
-- ── Edge Function recalculation contract ─────────────────────────────────────
--
--   expected_score =
--     SUM(kills_per_wave[i] * 100 * wave_numbers[i])  for i=1..waves_survived
--   + kills_per_wave[waves_survived+1] * 100 * (wave_numbers[last]+1)
--                                                      (if extra slot present)
--   + SUM(500 * wave_numbers[i])                       for i=1..waves_survived
--   + SUM(MAX(0, 60 - wave_durations[i]) * 5)          for i=1..waves_survived
--
--   Submitted score MUST equal expected_score exactly. Mismatch => 400 rejection.
--
--   NOTE: score reconstruction only verifies arithmetic consistency. It cannot
--   prove the match actually occurred. Anti-cheat at gameplay level is
--   out of scope for v1.
-- =============================================================================

-- ── Shared enum type ──────────────────────────────────────────────────────────
-- Defined here (before pvp_matches) so migration 003 can reference it.

CREATE TYPE public.pvp_result AS ENUM ('win', 'loss', 'draw');

COMMENT ON TYPE public.pvp_result
  IS '1v1 match result from the perspective of player1 (authenticated host).';

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solo_matches (
  -- Identity
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_uuid  uuid        NOT NULL UNIQUE,  -- client-generated UUID v4, idempotency key

  -- Ownership
  player_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Gameplay data — all validated by Edge Function before insert.
  score               integer   NOT NULL CHECK (score >= 0 AND score <= 500000),

  -- waves_survived = 0 is valid: player dies before completing a single wave.
  waves_survived      integer   NOT NULL CHECK (waves_survived >= 0 AND waves_survived <= 50),

  kills               integer   NOT NULL CHECK (kills >= 0 AND kills <= 400),
  total_duration_seconds integer NOT NULL CHECK (total_duration_seconds > 0),

  -- wave_durations[i] = duration in seconds of wave wave_numbers[i].
  -- Both arrays must have the same length (= waves_survived when > 0, else 0).
  -- Length equality between the two arrays is enforced by the Edge Function;
  -- the DB CHECK here is a safety net bounding the array size.
  wave_durations  integer[] NOT NULL
                  CHECK (array_length(wave_durations,  1) IS NULL   -- empty array OK
                      OR array_length(wave_durations,  1) <= 50),

  -- wave_numbers[i]: 1-based wave index for completed wave i.
  wave_numbers    integer[] NOT NULL
                  CHECK (array_length(wave_numbers, 1) IS NULL
                      OR array_length(wave_numbers, 1) <= 50),

  -- kills_per_wave[i]: kills in wave slot i.
  -- Slots 1..waves_survived correspond to completed waves (parallel to wave_numbers).
  -- Slot waves_survived+1, if present, holds kills from the final incomplete wave.
  -- Max length = 51 (50 completed waves + 1 partial wave slot).
  -- Individual element non-negativity is enforced by the Edge Function.
  kills_per_wave  integer[] NOT NULL
                  CHECK (array_length(kills_per_wave, 1) IS NULL
                      OR array_length(kills_per_wave, 1) <= 51),

  -- Timestamp
  played_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.solo_matches IS 'One row per completed Solo mode run.';
COMMENT ON COLUMN public.solo_matches.match_uuid     IS 'UUID v4 — idempotency key.';
COMMENT ON COLUMN public.solo_matches.wave_durations IS 'Duration (s) of each completed wave. Length = waves_survived.';
COMMENT ON COLUMN public.solo_matches.wave_numbers   IS 'Wave indices for completed waves. Same length as wave_durations.';
COMMENT ON COLUMN public.solo_matches.kills_per_wave IS 'Kills per slot. Length = waves_survived, or waves_survived+1 if player died in a partial wave (extra slot = partial wave kills).';
COMMENT ON COLUMN public.solo_matches.kills          IS 'Total kills = SUM(kills_per_wave). Verified by Edge Function.';

-- ── Explicit GRANTs ───────────────────────────────────────────────────────────

-- authenticated users may SELECT (policy below limits to own rows).
GRANT SELECT ON public.solo_matches TO authenticated;
-- anon gets no access: match history is not public.

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.solo_matches ENABLE ROW LEVEL SECURITY;

-- Owner-only read: a player may query only their own match history.
-- The rankings RPC (migration 005) uses SECURITY DEFINER and reads all rows
-- server-side — it does not depend on this policy.
CREATE POLICY "solo_matches: owner read"
  ON public.solo_matches
  FOR SELECT
  USING (auth.uid() = player_id);

-- ── DENY all client writes (INSERT, UPDATE, DELETE) ──────────────────────────
-- Writes are exclusively via the Edge Function (service role, bypasses RLS).

REVOKE INSERT, UPDATE, DELETE ON public.solo_matches FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.solo_matches FROM authenticated;
