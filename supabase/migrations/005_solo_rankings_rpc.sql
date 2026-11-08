-- =============================================================================
-- Migration 005: solo_rankings RPC  (revised)
-- BOMB//SHIFT — ST-02 Part 1
--
-- Changes from original:
--   • SET search_path = '' (empty) with fully-qualified object references.
--     This prevents search_path injection attacks in SECURITY DEFINER functions.
--   • REVOKE EXECUTE FROM PUBLIC before granting to specific roles.
--   • Tiebreaker order confirmed: equal scores → more waves → older achievement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.solo_rankings()
RETURNS TABLE (
  player_id          uuid,
  username           text,
  best_score         integer,
  best_run_waves     integer,    -- waves_survived of the run that produced best_score
  best_run_played_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Empty search_path: all objects referenced by fully-qualified name below.
SET search_path = ''
AS $$
  SELECT
    best.player_id,
    p.username,
    best.score          AS best_score,
    best.waves_survived AS best_run_waves,
    best.played_at      AS best_run_played_at
  FROM (
    -- DISTINCT ON picks exactly one row per player: the one with the highest score.
    -- Equal scores → more waves survived → oldest achievement (deterministic).
    SELECT DISTINCT ON (m.player_id)
      m.player_id,
      m.score,
      m.waves_survived,
      m.played_at
    FROM public.solo_matches m
    ORDER BY
      m.player_id,
      m.score          DESC,
      m.waves_survived DESC,
      m.played_at      ASC
  ) AS best
  JOIN public.profiles p ON p.id = best.player_id
  ORDER BY
    best.score          DESC,
    best.waves_survived DESC,
    best.played_at      ASC;
$$;

COMMENT ON FUNCTION public.solo_rankings()
  IS 'Solo leaderboard. waves_survived is from the SAME run as best_score.';

-- Revoke from PUBLIC first, then grant only to the roles that need it.
REVOKE EXECUTE ON FUNCTION public.solo_rankings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.solo_rankings() TO anon, authenticated;
