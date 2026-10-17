import { useEffect, useMemo, useState } from 'react'
import { useIptvStore } from '../store/useIptvStore'
import type { SeriesEpisode, SeriesSeason, VodItem } from '../types/iptv'
import { xtreamService } from '../services/xtreamService'
import { tmdbService } from '../services/tmdbService'

/**
 * Fiche d'un film ou d'une série : complète le titre avec les informations du fournisseur Xtream
 * (résumé, casting, saisons et épisodes) puis de TMDB si une clé est saisie. Partagée par la fiche TV / ordinateur
 * et la fiche iPhone.
 */
export function useVodDetails(item: VodItem) {
  const xtreamCreds = useIptvStore((s) => s.xtreamCreds)
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)

  const [details, setDetails] = useState<VodItem>(item)
  const [seasons, setSeasons] = useState<SeriesSeason[] | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [episodesError, setEpisodesError] = useState<string | null>(null)

  const isXtreamSeries = item.type === 'series' && item.id.startsWith('series_') && !!xtreamCreds

  useEffect(() => {
    let cancelled = false
    const merge = (extra: Partial<VodItem>) =>
      setDetails((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(extra)) {
          if (v !== undefined && v !== '' && !(next as Record<string, unknown>)[k]) (next as Record<string, unknown>)[k] = v
        }
        return next
      })

    const load = async () => {
      try {
        if (xtreamCreds && item.type === 'movie' && item.id.startsWith('vod_')) {
          merge(await xtreamService.getVodInfo(xtreamCreds, item.streamId))
        }
        if (isXtreamSeries) {
          try {
            const result = await xtreamService.getSeriesInfo(xtreamCreds!, item.streamId)
            if (cancelled) return
            merge(result.info)
            setSeasons(result.seasons)
            setSeason(result.seasons[0]?.season ?? null)
          } catch {
            if (!cancelled) setEpisodesError('Impossible de récupérer la liste des épisodes. Réessayez dans un instant.')
          }
        }
        if (tmdbService.isConfigured()) {
          const meta = await tmdbService.searchMedia(item.name, item.type === 'movie' ? 'movie' : 'tv')
          if (meta && !cancelled) {
            merge({ overview: meta.overview, backdrop: meta.backdrop, rating: meta.rating, year: meta.year, logo: meta.poster })
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [item, xtreamCreds, isXtreamSeries])

  const movieResume = vodResumePoints[item.id]
  const currentSeason = seasons?.find((s) => s.season === season)

  // Reprendre une série : le dernier épisode entamé
  const lastEpisode = useMemo(() => {
    if (!seasons) return null
    let best: { episode: SeriesEpisode; updatedAt: number } | null = null
    for (const s of seasons) {
      for (const ep of s.episodes) {
        const point = vodResumePoints[`${item.id}_ep_${ep.id}`]
        if (point && (!best || point.updatedAt > best.updatedAt)) best = { episode: ep, updatedAt: point.updatedAt }
      }
    }
    return best?.episode ?? null
  }, [seasons, vodResumePoints, item.id])

  return {
    details,
    seasons,
    season,
    setSeason,
    currentSeason,
    loading,
    episodesError,
    isXtreamSeries,
    movieResume,
    lastEpisode,
    vodResumePoints,
    directPlayable: !isXtreamSeries && !!item.streamUrl,
  }
}
