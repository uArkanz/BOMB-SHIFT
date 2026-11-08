-- =============================================================================
-- Migration 006: pvp_rankings RPC  (revised)
-- BOMB//SHIFT — ST-02 Part 1
--
-- Changes from original:
--   • SET search_path = '' (empty) with fully-qualified object references.
--   • REVOKE EXECUTE FROM PUBLIC before granting to specific roles.
--   • Logic unchanged: >= 5 matches, win_count DESC, win_rate DESC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pvp_rankings()
RETURNS TABLE (
  player1_id    uuid,
  username      text,
  win_count     bigint,
  total_matches bigint,
  win_rate      double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.player1_id,
    p.username,
    COUNT(*) FILTER (WHERE m.result = 'win')                              AS win_count,
    COUNT(*)                                                               AS total_matches,
    COUNT(*) FILTER (WHERE m.result = 'win')::double precision / COUNT(*) AS win_rate
  FROM public.pvp_matches m
  JOIN public.profiles p ON p.id = m.player1_id
  GROUP BY m.player1_id, p.username
  HAVING COUNT(*) >= 5
  ORDER BY
    win_count DESC,
    win_rate  DESC,
    p.username ASC;
$$;

COMMENT ON FUNCTION public.pvp_rankings()
  IS '1v1 leaderboard. Requires >= 5 matches. Draws = 0 wins, 1 match played.';

REVOKE EXECUTE ON FUNCTION public.pvp_rankings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pvp_rankings() TO anon, authenticated;
