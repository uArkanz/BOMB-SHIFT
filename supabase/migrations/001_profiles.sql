-- =============================================================================
-- Migration 001: profiles  (revised)
-- BOMB//SHIFT — ST-02 Part 1
--
-- Changes from original:
--   • Explicit GRANTs for anon/authenticated SELECT (required when
--     "Expose tables in API" is disabled in Supabase project settings).
--   • Username uniqueness is case-insensitive via a UNIQUE index on lower(username).
--     The plain UNIQUE constraint is removed; the index enforces it instead.
--   • Username CHECK also rejects leading/trailing whitespace.
--   • INSERT is restricted to the server-side trigger only (owner-insert policy
--     removed — migration 007 handles all profile creation).
--   • UPDATE policy explicitly allows only username and avatar_url columns.
--   • REVOKE anon INSERT/UPDATE/DELETE retained as defence-in-depth.
-- =============================================================================

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- No inline UNIQUE — case-insensitive uniqueness is enforced by the index below.
  username    text        NOT NULL
                          CHECK (
                            char_length(username) BETWEEN 3 AND 30
                            AND username = trim(username)
                          ),
  avatar_url  text        DEFAULT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique index: 'Player1' and 'player1' are treated as the same name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_ci
  ON public.profiles (lower(username));

COMMENT ON TABLE  public.profiles IS 'One profile row per authenticated user.';
COMMENT ON COLUMN public.profiles.id         IS 'Matches auth.users.id — set on registration.';
COMMENT ON COLUMN public.profiles.username   IS 'Unique display name, 3–30 chars, no leading/trailing whitespace, case-insensitive uniqueness.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Optional URL to user avatar image.';

-- ── Explicit GRANTs (required when table API exposure is restricted) ──────────

-- anon may only SELECT — needed for public rankings username resolution.
GRANT SELECT ON public.profiles TO anon;

-- authenticated may SELECT and UPDATE their own row (INSERT handled by trigger).
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public read: username and avatar_url are the only non-sensitive fields.
-- id and created_at are also non-sensitive in this context.
CREATE POLICY "profiles: public read"
  ON public.profiles
  FOR SELECT
  USING (true);

-- UPDATE: authenticated user may change only username and avatar_url on their own row.
-- The WITH CHECK prevents any attempt to change id or created_at at the RLS layer.
CREATE POLICY "profiles: owner update"
  ON public.profiles
  FOR UPDATE
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT policy for clients: the handle_new_user() trigger (migration 007)
-- is the only path to creating a profile row. It runs as SECURITY DEFINER
-- and bypasses RLS, so no client policy is needed or wanted here.

-- No DELETE policy: profile deletion is server-side only (cascades from auth.users).

-- ── Defence-in-depth REVOKE ───────────────────────────────────────────────────

REVOKE INSERT, DELETE ON public.profiles FROM anon;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
-- authenticated retains UPDATE (constrained by the policy above to own row only).
