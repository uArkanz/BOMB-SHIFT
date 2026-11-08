# BOMB//SHIFT — Supabase Migrations

Apply in order (001 → 007). Each file depends on the previous ones.

## Files

| # | File | Contents |
|---|---|---|
| 001 | `001_profiles.sql` | `profiles` table, case-insensitive unique username index, RLS, explicit GRANTs |
| 002 | `002_solo_matches.sql` | `pvp_result` enum, `solo_matches` table with `wave_numbers[]` column, owner-only RLS |
| 003 | `003_pvp_matches.sql` | `pvp_matches` table, owner-only RLS, 1800 s duration cap |
| 004 | `004_indexes.sql` | Performance indexes (redundant username index removed) |
| 005 | `005_solo_rankings_rpc.sql` | `solo_rankings()` — DISTINCT ON tiebreaker, empty search_path |
| 006 | `006_pvp_rankings_rpc.sql` | `pvp_rankings()` — min 5 matches, empty search_path |
| 007 | `007_profile_trigger.sql` | `handle_new_user()` — random slug, no email exposure, empty search_path |

## How to apply

**Supabase dashboard (SQL Editor):** paste and run each file in order, one at a time.

**Supabase CLI:**
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

> Never skip or reorder files. Migration 003 depends on the `pvp_result` type created in 002.

## RLS and access summary

| Table | anon SELECT | auth SELECT | auth INSERT | auth UPDATE | auth DELETE |
|---|---|---|---|---|---|
| `profiles` | ✅ (all rows) | ✅ (all rows) | ❌ (trigger only) | ✅ own row | ❌ |
| `solo_matches` | ❌ | ✅ own rows | ❌ | ❌ | ❌ |
| `pvp_matches` | ❌ | ✅ own rows | ❌ | ❌ | ❌ |

Match tables are written **exclusively by Edge Functions** using the service role, which bypasses RLS.

## Key design decisions

### profiles
- **Case-insensitive uniqueness** enforced via `UNIQUE INDEX ON lower(username)` — `Player1` and `player1` are the same name.
- **INSERT locked to trigger**: no client INSERT policy exists. `handle_new_user()` (migration 007) is the only creation path.
- **UPDATE restricted** to `username` and `avatar_url` on own row via RLS policy + column-level discipline in the app layer.

### solo_matches
- **`waves_survived = 0`** is valid: player dies in wave 1 before clearing it.
- **`wave_numbers[]`** and **`wave_durations[]`**: parallel arrays for completed waves; same length = `waves_survived`.
- **`kills_per_wave[]`**: kills per wave slot. Length is `waves_survived` (all waves complete) or `waves_survived + 1` (extra slot = kills in the final incomplete wave when the player dies mid-wave).
- **`kills`** must equal `SUM(kills_per_wave)` — verified by Edge Function.
- **Score recalculation**: Edge Function reconstructs `expected_score = kill_points + clear_bonus + time_bonus` using the parallel arrays, and rejects the payload if the submitted score doesn't match exactly. This verifies arithmetic consistency only — it does not prove the match actually occurred.
- **Private history**: only the owning player can read their own rows. The `solo_rankings()` RPC reads all rows server-side via `SECURITY DEFINER`.

### pvp_matches
- **Private history**: only `player1` can read their own rows.
- **`duration_seconds` capped at 1800 s** (30 minutes) as a reasonable upper bound for a 1v1 match.
- **`player2_name`** is stored already-trimmed; the Edge Function strips whitespace before submission.

### solo_rankings RPC
- `DISTINCT ON (player_id) ORDER BY score DESC, waves_survived DESC` ensures `waves_survived` in the result always comes from the **same run** as `best_score`.
- `SET search_path = ''` + fully-qualified object names prevents search_path injection.
- `REVOKE EXECUTE FROM PUBLIC` before granting to `anon, authenticated`.

### pvp_rankings RPC
- Same `SET search_path = ''` and `REVOKE/GRANT` pattern.
- `HAVING COUNT(*) >= 5` excludes players with fewer than 5 matches.
- Draws count as 0 wins, 1 match played in the win-rate formula.

### profile trigger
- Generates `player_XXXXXXXX` (8 random hex chars) — no email content exposed.
- **Collision handling**: up to 20 regenerations using a new 8-char hex slug; if all fail (virtually impossible), falls back to a 12-char hex slug from a full UUID.
- **Explicit REVOKE**: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` — prevents direct client calls. The trigger mechanism runs with elevated privileges and is unaffected by these REVOKEs.
