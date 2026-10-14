export interface TmdbMetadata {
  tmdbId?: number
  title: string
  overview?: string
  rating?: number
  poster?: string
  backdrop?: string
  year?: string
  genres?: string[]
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

/**
 * Nettoie les noms de films et séries en retirant les tags de qualité, langue, encodage
 * Exemple : "Gladiator.2000.4K.MULTi.TRUEFRENCH.HEVC.mkv" -> "Gladiator"
 */
export function cleanMediaTitle(raw: string): { title: string; year?: string } {
  let title = raw.trim()

  // Supprimer les extensions de fichier
  title = title.replace(/\.(mkv|mp4|avi|ts|mov)$/i, '')

  // Extraire une année éventuelle (19xx ou 20xx)
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/)
  const year = yearMatch ? yearMatch[1] : undefined

  // Remplacer les points, underscores par des espaces
  title = title.replace(/[._]/g, ' ')

  // Supprimer le contenu entre crochets [4K] [FR]
  title = title.replace(/\[[^\]]*\]/g, ' ')

  // Liste des tags indésirables à supprimer
  const unwantedTags = [
    /\b(4k|uhd|fhd|hd|sd|hevc|h\.?265|h\.?264|x264|x265|1080p|720p|2160p|hdr|hdr10|dv|remux|web-?dl|bluray|bdrip)\b/gi,
    /\b(fr|vf|vff|vfq|vostfr|vost|multi|truefrench|french|eng|english|sub|vo)\b/gi,
    /\b(ac3|dts|aac|eac3|atmos|5\.1|7\.1)\b/gi,
    /\b(complete|saison\s*\d+|season\s*\d+|s\d{1,2}|e\d{1,2}|episode\s*\d+)\b/gi,
    /\b(19\d{2}|20\d{2})\b/g, // retirer l'année du titre pour la recherche
  ]

  for (const regex of unwantedTags) {
    title = title.replace(regex, ' ')
  }

  // Nettoyer les parenthèses vides ou résiduelles
  title = title.replace(/\(\s*\)/g, ' ')
  title = title.replace(/[-:]\s*$/g, '')
  title = title.replace(/\s+/g, ' ').trim()

  return { title: title || raw.trim(), year }
}

const TMDB_KEY_STORAGE = 'moovo_tmdb_api_key'

export function getTmdbApiKey(): string {
  try {
    return localStorage.getItem(TMDB_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function setTmdbApiKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(TMDB_KEY_STORAGE, key.trim())
    else localStorage.removeItem(TMDB_KEY_STORAGE)
  } catch {
    // Stockage indisponible : la clé restera valable pour la session seulement.
  }
}

const cache = new Map<string, TmdbMetadata | null>()

export const tmdbService = {
  /** TMDB est utilisable dès qu’une clé API v3 (gratuite) est enregistrée dans les réglages. */
  isConfigured(): boolean {
    return getTmdbApiKey().length > 0
  },

  /**
   * Recherche affiche, fond, synopsis et note d’un film ou d’une série.
   * Renvoie null sans clé, si le titre est inconnu ou si TMDB est injoignable : aucune donnée inventée.
   */
  async searchMedia(rawTitle: string, type: 'movie' | 'tv' = 'movie'): Promise<TmdbMetadata | null> {
    const apiKey = getTmdbApiKey()
    if (!apiKey) return null

    const { title: cleanTitle, year } = cleanMediaTitle(rawTitle)
    const cacheKey = `${type}:${cleanTitle}:${year || ''}`
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null

    try {
      const queryParams = new URLSearchParams({
        api_key: apiKey,
        query: cleanTitle,
        language: 'fr-FR',
        include_adult: 'false',
        ...(year ? { [type === 'movie' ? 'year' : 'first_air_date_year']: year } : {}),
      })
      const res = await fetch(`https://api.themoviedb.org/3/search/${type}?${queryParams.toString()}`)
      if (!res.ok) return null

      const data = await res.json()
      const first = data?.results?.[0]
      if (!first) {
        cache.set(cacheKey, null)
        return null
      }

      const meta: TmdbMetadata = {
        tmdbId: first.id,
        title: first.title || first.name || cleanTitle,
        overview: first.overview || undefined,
        rating: first.vote_average ? Math.round(first.vote_average * 10) / 10 : undefined,
        poster: first.poster_path ? `${TMDB_IMAGE_BASE}/w500${first.poster_path}` : undefined,
        backdrop: first.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${first.backdrop_path}` : undefined,
        year: (first.release_date || first.first_air_date || '').slice(0, 4) || year,
      }
      cache.set(cacheKey, meta)
      return meta
    } catch (err) {
      console.warn('[TMDB] Requête impossible pour :', cleanTitle, err)
      return null
    }
  },
}
