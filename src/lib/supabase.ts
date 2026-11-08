// src/lib/supabase.ts
// Typed Supabase client singleton.
// Reads credentials from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.
// The app starts normally even when these are not set — calls will simply fail
// gracefully until real credentials are provided.

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
      'Copy .env.example to .env.local and fill in your project credentials.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
