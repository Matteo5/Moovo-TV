import { useEffect, useMemo, useState } from 'react'
import type { VodItem } from '../types/iptv'
import { buildCatalogIndex, fetchTrending, matchTrending, type TrendingEntry, type TrendingMatch } from '../services/trendingService'
import { getTmdbApiKey } from '../services/tmdbService'

/** Tendances TMDB de la semaine présentes dans le catalogue `items` (vide sans clé TMDB). */
export function useTrending(type: 'movie' | 'tv', items: VodItem[]): { matches: TrendingMatch[]; enabled: boolean; loading: boolean } {
  const enabled = getTmdbApiKey().length > 0
  const [entries, setEntries] = useState<TrendingEntry[] | null>(null)

  useEffect(() => {
    if (!enabled || items.length === 0) return
    let alive = true
    fetchTrending(type).then((list) => {
      if (alive) setEntries(list)
    })
    return () => {
      alive = false
    }
  }, [enabled, type, items.length])

  const index = useMemo(() => (enabled && items.length ? buildCatalogIndex(items) : null), [enabled, items])
  const matches = useMemo(() => (entries && index ? matchTrending(entries, index) : []), [entries, index])

  return { matches, enabled, loading: enabled && items.length > 0 && entries === null }
}
