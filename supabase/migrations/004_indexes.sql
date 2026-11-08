-- =============================================================================
-- Migration 004: indexes  (revised)
-- BOMB//SHIFT — ST-02 Part 1
--
-- Changes from original:
--   • Removed idx_profiles_username: the UNIQUE index on lower(username)
--     created in migration 001 already covers all username lookups.
--     Two indexes on the same column would waste storage with no benefit.
--   • All other indexes are unchanged and remain useful.
-- =============================================================================

-- ── solo_matches ──────────────────────────────────────────────────────────────

-- Used by solo_rankings RPC: DISTINCT ON (player_id) ORDER BY score DESC.
CREATE INDEX IF NOT EXISTS idx_solo_matches_player_score
  ON public.solo_matches (player_id, score DESC);

-- Used by ProfilePage match history: per-player ordered by most recent.
CREATE INDEX IF NOT EXISTS idx_solo_matches_player_played_at
  ON public.solo_matches (player_id, played_at DESC);

-- ── pvp_matches ───────────────────────────────────────────────────────────────

-- Used by pvp_rankings RPC: GROUP BY player1_id, COUNT FILTER WHERE result='win'.
CREATE INDEX IF NOT EXISTS idx_pvp_matches_player1_result
  ON public.pvp_matches (player1_id, result);

-- Used by ProfilePage match history: per-player ordered by most recent.
CREATE INDEX IF NOT EXISTS idx_pvp_matches_player1_played_at
  ON public.pvp_matches (player1_id, played_at DESC);
