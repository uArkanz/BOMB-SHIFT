// src/hooks/useRankings.ts
// Fetches solo and 1v1 ranking data from Supabase RPCs.
// Both RPCs already exist in the remote project (created with the ST-12 migrations).
// Returns typed arrays with loading and error states.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { SoloRankingRow, PvpRankingRow } from '@/lib/database.types'

export interface RankingsState {
  solo: SoloRankingRow[]
  pvp: PvpRankingRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useRankings(): RankingsState {
  const [solo, setSolo] = useState<SoloRankingRow[]>([])
  const [pvp, setPvp] = useState<PvpRankingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [soloRes, pvpRes] = await Promise.all([
        supabase.rpc('solo_rankings'),
        supabase.rpc('pvp_rankings'),
      ])

      if (soloRes.error) throw new Error(soloRes.error.message)
      if (pvpRes.error) throw new Error(pvpRes.error.message)

      setSolo((soloRes.data as SoloRankingRow[]) ?? [])
      setPvp((pvpRes.data as PvpRankingRow[]) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar rankings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  return { solo, pvp, loading, error, refresh: fetch }
}
