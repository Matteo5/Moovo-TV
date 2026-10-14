import type { VodItem } from '../types/iptv'
import { getTmdbApiKey } from './tmdbService'

/**
 * « Tendances » de l'accueil : les films et séries les plus vus de la semaine selon TMDB,
 * croisés avec le catalogue de l'abonnement. Seuls les titres réellement disponibles sont gardés.
 * La liste TMDB est gardée 6 h en cache local : l'accueil s'affiche sans attendre le réseau.
 */

export interface TrendingEntry {
  tmdbId: number
  title: string
  originalTitle?: string
  year?: string
  overview?: string
  rating?: number
  poster?: string
  backdrop?: string
}

export interface TrendingMatch {
  item: VodItem
  rank: number
  entry: TrendingEntry
}

const IMG = 'https://image.tmdb.org/t/p'
const TTL_MS = 6 * 3600_000
const CACHE_KEY = (type: 'movie' | 'tv') => `moovo_trending_${type}`

function readCache(type: 'movie' | 'tv'): TrendingEntry[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(type))
    if (!raw) return null
    const { at, items } = JSON.parse(raw) as { at: number; items: TrendingEntry[] }
    return Date.now() - at < TTL_MS && Array.isArray(items) ? items : null
  } catch {
    return null
  }
}

function writeCache(type: 'movie' | 'tv', items: TrendingEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY(type), JSON.stringify({ at: Date.now(), items }))
  } catch {
    // Quota plein : la liste sera simplement redemandée la prochaine fois.
  }
}

/** Titre réduit à ses lettres et chiffres, sans accents ni articles de ponctuation, pour comparer. */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** À appeler quand la clé TMDB change : la prochaine visite de l'accueil redemande la liste. */
export function clearTrendingCache() {
  try {
    localStorage.removeItem(CACHE_KEY('movie'))
    localStorage.removeItem(CACHE_KEY('tv'))
  } catch {
    // ignore
  }
}

const inflight = new Map<string, Promise<TrendingEntry[]>>()

/** Tendances de la semaine (2 pages, ~40 titres). Liste vide sans clé TMDB ou hors ligne. */
export function fetchTrending(type: 'movie' | 'tv'): Promise<TrendingEntry[]> {
  const key = getTmdbApiKey()
  if (!key) return Promise.resolve([])
  const cached = readCache(type)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(type)
  if (pending) return pending

  const run = (async () => {
    const pages = await Promise.all(
      [1, 2].map(async (page) => {
        const params = new URLSearchParams({ api_key: key, language: 'fr-FR', page: String(page) })
        const res = await fetch(`https://api.themoviedb.org/3/trending/${type}/week?${params}`)
        if (!res.ok) throw new Error(`TMDB ${res.status}`)
        const data = await res.json()
        return (data?.results ?? []) as Record<string, unknown>[]
      })
    )
    const items: TrendingEntry[] = pages.flat().map((r) => ({
      tmdbId: Number(r.id),
      title: String(r.title || r.name || ''),
      originalTitle: (r.original_title || r.original_name) as string | undefined,
      year: String(r.release_date || r.first_air_date || '').slice(0, 4) || undefined,
      overview: (r.overview as string) || undefined,
      rating: r.vote_average ? Math.round(Number(r.vote_average) * 10) / 10 : undefined,
      poster: r.poster_path ? `${IMG}/w342${r.poster_path}` : undefined,
      backdrop: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : undefined,
    }))
    writeCache(type, items)
    return items
  })()
    .catch((err) => {
      console.warn('[Tendances] TMDB injoignable :', err)
      return [] as TrendingEntry[]
    })
    .finally(() => inflight.delete(type))

  inflight.set(type, run)
  return run
}

/** Index du catalogue par identifiant TMDB et par titre normalisé (construit une fois par catalogue). */
export function buildCatalogIndex(items: VodItem[]) {
  const byTmdb = new Map<number, VodItem>()
  const byTitle = new Map<string, VodItem[]>()
  for (const it of items) {
    if (it.tmdbId) byTmdb.set(it.tmdbId, it)
    const k = normalizeTitle(it.cleanTitle)
    if (!k) continue
    const list = byTitle.get(k)
    if (list) list.push(it)
    else byTitle.set(k, [it])
  }
  return { byTmdb, byTitle }
}

function yearsCompatible(a?: string, b?: string) {
  if (!a || !b) return true
  return Math.abs(parseInt(a, 10) - parseInt(b, 10)) <= 1
}

/** Titres tendance disponibles dans le catalogue, dans l'ordre TMDB. */
export function matchTrending(entries: TrendingEntry[], index: ReturnType<typeof buildCatalogIndex>): TrendingMatch[] {
  const seen = new Set<string>()
  const out: TrendingMatch[] = []
  entries.forEach((entry, i) => {
    let item = index.byTmdb.get(entry.tmdbId)
    if (!item) {
      for (const t of [entry.title, entry.originalTitle]) {
        if (!t) continue
        const candidates = index.byTitle.get(normalizeTitle(t))
        item = candidates?.find((c) => yearsCompatible(c.year, entry.year))
        if (item) break
      }
    }
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      out.push({ item, rank: i + 1, entry })
    }
  })
  return out
}

/** Repli sans TMDB : les derniers ajouts du fournisseur (si le panel donne la date). */
export function recentlyAdded(items: VodItem[], limit = 24): VodItem[] {
  return items
    .filter((it) => it.addedAt)
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .slice(0, limit)
}

/** Repli sans TMDB : les mieux notés selon le fournisseur. */
export function topRated(items: VodItem[], limit = 24): VodItem[] {
  return items
    .filter((it) => (it.rating || 0) >= 7 && (it.rating || 0) <= 10)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit)
}
