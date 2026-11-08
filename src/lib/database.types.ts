// src/lib/database.types.ts
// TypeScript types generated from the BOMB//SHIFT Supabase schema.
// Keep in sync with supabase/migrations/*.sql.
// Used by supabase-js v2 for typed queries: createClient<Database>(...).

// ── Primitives ────────────────────────────────────────────────────────────────

export type PvpResult = 'win' | 'loss' | 'draw'

// ── Row types (shape returned by SELECT *) ────────────────────────────────────

export type ProfileRow = {
  id: string           // uuid — matches auth.users.id
  username: string     // 3–30 chars, unique
  avatar_url: string | null
  created_at: string   // ISO-8601 timestamptz
}

export type SoloMatchRow = {
  id: string                   // uuid PK
  match_uuid: string           // uuid v4 — idempotency key
  player_id: string            // uuid FK → profiles.id
  score: number                // 0–500 000
  waves_survived: number       // 0–50 (= length of wave_numbers; 0 = died in wave 1)
  kills: number                // 0–400; must equal SUM(kills_per_wave)
  total_duration_seconds: number
  wave_durations: number[]     // duration (s) of each completed wave; length = waves_survived
  wave_numbers: number[]       // 1-based wave index per completed wave; same length as wave_durations
  kills_per_wave: number[]     // kills per slot; length = waves_survived OR waves_survived+1
                               // extra slot (index waves_survived+1) = kills in final incomplete wave
  played_at: string            // ISO-8601 timestamptz
}

export type PvpMatchRow = {
  id: string                   // uuid PK
  match_uuid: string           // uuid v4 — idempotency key
  player1_id: string           // uuid FK → profiles.id
  player2_name: string         // 1–20 chars (guest)
  result: PvpResult
  duration_seconds: number
  played_at: string            // ISO-8601 timestamptz
}

// ── Insert types (shape sent to Edge Functions) ───────────────────────────────
// These omit server-generated fields (id, played_at).

export type SoloMatchInsert = {
  match_uuid: string
  player_id: string
  score: number
  waves_survived: number       // 0 allowed (died in wave 1 before clearing)
  kills: number                // must equal SUM(kills_per_wave)
  total_duration_seconds: number
  wave_durations: number[]     // completed waves only; same length as wave_numbers
  wave_numbers: number[]       // 1-based wave indices; same length as wave_durations
  kills_per_wave: number[]     // length = waves_survived or waves_survived+1 (partial wave)
}

export type PvpMatchInsert = {
  match_uuid: string
  player1_id: string
  player2_name: string
  result: PvpResult
  duration_seconds: number
}

// ── RPC return types ──────────────────────────────────────────────────────────

/** Row returned by the solo_rankings() RPC. */
export type SoloRankingRow = {
  player_id: string
  username: string
  best_score: number
  best_run_waves: number        // waves_survived of the SAME run as best_score
  best_run_played_at: string
}

/** Row returned by the pvp_rankings() RPC. */
export type PvpRankingRow = {
  player1_id: string
  username: string
  win_count: number
  total_matches: number
  win_rate: number              // 0.0–1.0; draws count as 0 wins, 1 match played
}

// ── Database type map (for createClient<Database>) ────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Omit<ProfileRow, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at'>>
        Relationships: []
      }
      solo_matches: {
        Row: SoloMatchRow
        Insert: SoloMatchInsert & { id?: string; played_at?: string }
        Update: Partial<SoloMatchRow>
        Relationships: []
      }
      pvp_matches: {
        Row: PvpMatchRow
        Insert: PvpMatchInsert & { id?: string; played_at?: string }
        Update: Partial<PvpMatchRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      solo_rankings: {
        Args: Record<string, never>
        Returns: SoloRankingRow[]
      }
      pvp_rankings: {
        Args: Record<string, never>
        Returns: PvpRankingRow[]
      }
    }
    Enums: {
      pvp_result: PvpResult
    }
  }
}
