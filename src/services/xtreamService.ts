import type {
  Channel,
  EpgProgram,
  XtreamCredentials,
  XtreamUserInfo,
  XtreamServerInfo,
  XtreamCategory,
  XtreamStream,
  VodItem,
  SeriesSeason,
} from '../types/iptv'
import { cleanMediaTitle } from './tmdbService'

/**
 * Nettoie et normalise l'URL du serveur Xtream
 */
export function cleanServerUrl(url: string): string {
  let cleaned = url.trim()
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`
  }
  return cleaned.replace(/\/+$/, '')
}

/**
 * Exécute un appel à l'API Xtream via le proxy intégré (les panels n'envoient pas d'en-têtes CORS)
 */
async function fetchXtreamApi(serverUrl: string, endpoint: string): Promise<string> {
  const targetUrl = `${cleanServerUrl(serverUrl)}${endpoint}`
  const response = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
    headers: { Accept: 'application/json, text/plain, */*' },
  })

  const text = await response.text()
  if (response.ok) return text

  if (response.status === 404) {
    throw new Error(
      `Erreur 404 sur le serveur. L'API Xtream Codes (/player_api.php) est introuvable sur cette adresse.`
    )
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed?.error) throw new Error(parsed.error)
  } catch (err) {
    if (err instanceof Error && !(err instanceof SyntaxError)) throw err
  }
  throw new Error(`Le serveur a répondu HTTP ${response.status}.`)
}

function apiEndpoint(creds: XtreamCredentials, action?: string, extra = ''): string {
  const user = encodeURIComponent(creds.username.trim())
  const pass = encodeURIComponent(creds.password.trim())
  return `/player_api.php?username=${user}&password=${pass}${action ? `&action=${action}` : ''}${extra}`
}

async function fetchJson(creds: XtreamCredentials, action?: string, extra = ''): Promise<any> {
  const text = await fetchXtreamApi(creds.serverUrl, apiEndpoint(creds, action, extra))
  return JSON.parse(text)
}

async function fetchCategoryMap(creds: XtreamCredentials, action: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const data = await fetchJson(creds, action)
    if (Array.isArray(data)) {
      for (const cat of data) {
        if (cat.category_id && cat.category_name) map.set(String(cat.category_id), String(cat.category_name).trim())
      }
    }
  } catch {
    // Catégories facultatives : les titres resteront sous un libellé générique.
  }
  return map
}

// Certains panels encodent les textes EPG courts en base64
function decodeMaybeBase64(value: string | undefined): string {
  if (!value) return ''
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) return value
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return value
  }
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Horodatage Unix du panel (secondes, parfois en texte) vers des millisecondes. */
function toTimestamp(value: unknown): number | undefined {
  const n = toNumber(value)
  if (!n) return undefined
  return n < 1e12 ? n * 1000 : n
}

export interface XtreamAuthResult {
  userInfo: XtreamUserInfo
  serverInfo: XtreamServerInfo
}

export const xtreamService = {
  /**
   * 1. Authentification Xtream Codes via /player_api.php
   */
  async authenticate(creds: XtreamCredentials): Promise<XtreamAuthResult> {
    const responseText = await fetchXtreamApi(creds.serverUrl, apiEndpoint(creds))

    let parsedData: any
    try {
      parsedData = JSON.parse(responseText)
    } catch {
      throw new Error(
        `Le serveur n'a pas renvoyé de réponse Xtream valide. Vérifiez l'adresse du serveur.`
      )
    }

    const uInfo = parsedData?.user_info
    if (uInfo) {
      if (uInfo.auth === 0 || uInfo.status === 'Disabled' || uInfo.status === 'Expired') {
        throw new Error(
          `Compte refusé par le serveur (statut « ${uInfo.status || 'non autorisé'} »). Vérifiez l'identifiant et le mot de passe.`
        )
      }
      const expSeconds = toNumber(uInfo.exp_date)
      return {
        userInfo: {
          username: uInfo.username || creds.username,
          status: uInfo.status || 'Active',
          expDate: expSeconds ? new Date(expSeconds * 1000).toISOString() : undefined,
          isTrial: uInfo.is_trial,
          activeCons: uInfo.active_cons != null ? String(uInfo.active_cons) : undefined,
          maxConnections: uInfo.max_connections != null ? String(uInfo.max_connections) : undefined,
          auth: uInfo.auth,
        },
        serverInfo: parsedData.server_info || {},
      }
    }

    return {
      userInfo: { username: creds.username, status: 'Active' },
      serverInfo: parsedData?.server_info || {},
    }
  },

  /**
   * 2. Catégories en direct
   */
  async getCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
    try {
      const data = await fetchJson(creds, 'get_live_categories')
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  },

  /**
   * 3. Chaînes en direct
   */
  async getLiveStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamStream[]> {
    try {
      const data = await fetchJson(
        creds,
        'get_live_streams',
        categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : ''
      )
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  },

  /**
   * 4. Films (catalogue complet, catégories nommées)
   */
  async getVodStreams(creds: XtreamCredentials): Promise<VodItem[]> {
    const user = encodeURIComponent(creds.username.trim())
    const pass = encodeURIComponent(creds.password.trim())
    const server = cleanServerUrl(creds.serverUrl)

    try {
      const [data, categories] = await Promise.all([
        fetchJson(creds, 'get_vod_streams'),
        fetchCategoryMap(creds, 'get_vod_categories'),
      ])
      if (!Array.isArray(data)) return []

      return data.map((item: any, idx: number): VodItem => {
        const ext = item.container_extension || 'mp4'
        const sId = item.stream_id ?? idx
        const { title: cleanTitle, year } = cleanMediaTitle(item.name || `Film ${sId}`)
        return {
          id: `vod_${sId}`,
          name: item.name || cleanTitle,
          cleanTitle,
          type: 'movie',
          streamUrl: `${server}/movie/${user}/${pass}/${sId}.${ext}`,
          streamId: sId,
          category: categories.get(String(item.category_id)) || item.category_name || 'Films',
          logo: item.stream_icon || undefined,
          containerExtension: ext,
          rating: toNumber(item.rating),
          year,
          tmdbId: toNumber(item.tmdb ?? item.tmdb_id),
          addedAt: toTimestamp(item.added),
        }
      })
    } catch (err) {
      console.warn('[Xtream] get_vod_streams non disponible sur ce serveur :', err)
      return []
    }
  },

  /**
   * 5. Séries (fiches ; les épisodes se chargent à l'ouverture via getSeriesInfo)
   */
  async getSeriesStreams(creds: XtreamCredentials): Promise<VodItem[]> {
    try {
      const [data, categories] = await Promise.all([
        fetchJson(creds, 'get_series'),
        fetchCategoryMap(creds, 'get_series_categories'),
      ])
      if (!Array.isArray(data)) return []

      return data.map((item: any, idx: number): VodItem => {
        const sId = item.series_id ?? idx
        const { title: cleanTitle, year } = cleanMediaTitle(item.name || `Série ${sId}`)
        return {
          id: `series_${sId}`,
          name: item.name || cleanTitle,
          cleanTitle,
          type: 'series',
          streamUrl: '',
          streamId: sId,
          category: categories.get(String(item.category_id)) || item.category_name || 'Séries',
          logo: item.cover || undefined,
          rating: toNumber(item.rating),
          year: year || (item.releaseDate || item.release_date || '').slice(0, 4) || undefined,
          overview: item.plot || undefined,
          backdrop: Array.isArray(item.backdrop_path) ? item.backdrop_path[0] : undefined,
          cast: item.cast || undefined,
          director: item.director || undefined,
          genres: item.genre ? String(item.genre).split(/\s*[,/]\s*/) : undefined,
          tmdbId: toNumber(item.tmdb ?? item.tmdb_id),
          addedAt: toTimestamp(item.last_modified),
        }
      })
    } catch (err) {
      console.warn('[Xtream] get_series non disponible sur ce serveur :', err)
      return []
    }
  },

  /**
   * Fiche détaillée d'un film (synopsis, casting, affiche, durée) fournie par le panel
   */
  async getVodInfo(creds: XtreamCredentials, vodId: string | number): Promise<Partial<VodItem>> {
    try {
      const data = await fetchJson(creds, 'get_vod_info', `&vod_id=${encodeURIComponent(String(vodId))}`)
      const info = data?.info || {}
      const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path
      return {
        overview: info.plot || info.description || undefined,
        cast: info.cast || info.actors || undefined,
        director: info.director || undefined,
        genres: info.genre ? String(info.genre).split(/\s*[,/]\s*/) : undefined,
        rating: toNumber(info.rating),
        year: (info.releasedate || info.release_date || '').slice(0, 4) || undefined,
        backdrop: backdrop || undefined,
        logo: info.movie_image || info.cover_big || undefined,
        runtime: info.duration || undefined,
      }
    } catch {
      return {}
    }
  },

  /**
   * Saisons et épisodes d'une série
   */
  async getSeriesInfo(
    creds: XtreamCredentials,
    seriesId: string | number
  ): Promise<{ seasons: SeriesSeason[]; info: Partial<VodItem> }> {
    const user = encodeURIComponent(creds.username.trim())
    const pass = encodeURIComponent(creds.password.trim())
    const server = cleanServerUrl(creds.serverUrl)

    const data = await fetchJson(creds, 'get_series_info', `&series_id=${encodeURIComponent(String(seriesId))}`)
    const episodesBySeason: Record<string, any[]> = data?.episodes || {}

    const seasons: SeriesSeason[] = Object.entries(episodesBySeason)
      .map(([seasonKey, list]) => ({
        season: Number(seasonKey) || 0,
        episodes: (Array.isArray(list) ? list : []).map((ep: any) => ({
          id: String(ep.id),
          episodeNum: Number(ep.episode_num) || 0,
          season: Number(ep.season ?? seasonKey) || 0,
          title: ep.title || `Épisode ${ep.episode_num}`,
          streamUrl: `${server}/series/${user}/${pass}/${ep.id}.${ep.container_extension || 'mp4'}`,
          plot: ep.info?.plot || undefined,
          duration: ep.info?.duration || undefined,
          image: ep.info?.movie_image || undefined,
        })),
      }))
      .filter((s) => s.episodes.length > 0)
      .sort((a, b) => a.season - b.season)

    for (const s of seasons) s.episodes.sort((a, b) => a.episodeNum - b.episodeNum)

    const info = data?.info || {}
    return {
      seasons,
      info: {
        overview: info.plot || undefined,
        cast: info.cast || undefined,
        director: info.director || undefined,
        genres: info.genre ? String(info.genre).split(/\s*[,/]\s*/) : undefined,
        rating: toNumber(info.rating),
        backdrop: Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : undefined,
        logo: info.cover || undefined,
      },
    }
  },

  /**
   * Programmes courts (en cours + à suivre) d'une chaîne, sans charger tout le XMLTV
   */
  async getShortEpg(
    creds: XtreamCredentials,
    streamId: string | number,
    limit = 4
  ): Promise<EpgProgram[]> {
    try {
      const data = await fetchJson(
        creds,
        'get_short_epg',
        `&stream_id=${encodeURIComponent(String(streamId))}&limit=${limit}`
      )
      const listings: any[] = data?.epg_listings || []
      return listings
        .map((l) => {
          const start = l.start_timestamp ? new Date(Number(l.start_timestamp) * 1000) : new Date(l.start)
          const stop = l.stop_timestamp ? new Date(Number(l.stop_timestamp) * 1000) : new Date(l.end)
          return {
            channelId: String(streamId),
            title: decodeMaybeBase64(l.title) || 'Programme',
            description: decodeMaybeBase64(l.description) || undefined,
            start,
            stop,
          }
        })
        .filter((p) => !Number.isNaN(p.start.getTime()) && !Number.isNaN(p.stop.getTime()))
    } catch {
      return []
    }
  },

  /**
   * Adresse du guide XMLTV complet fourni par le panel
   */
  buildXmltvUrl(creds: XtreamCredentials): string {
    const user = encodeURIComponent(creds.username.trim())
    const pass = encodeURIComponent(creds.password.trim())
    return `${cleanServerUrl(creds.serverUrl)}/xmltv.php?username=${user}&password=${pass}`
  },

  /**
   * 6. Construction de l'URL Catch-up (Timeshift Replay) au format standard Xtream :
   * [URL]/timeshift/[USER]/[PASS]/[DURATION]/[START_TIME]/[STREAM_ID].ts
   */
  buildCatchupUrl(
    serverUrl: string,
    username: string,
    password: string,
    streamId: string | number,
    startDate: Date,
    durationMinutes: number = 60
  ): string {
    const server = cleanServerUrl(serverUrl)
    // Format YYYY-MM-DD:HH-mm
    const pad = (n: number) => String(n).padStart(2, '0')
    const formattedStart = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}:${pad(startDate.getHours())}-${pad(startDate.getMinutes())}`

    return `${server}/timeshift/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${durationMinutes}/${formattedStart}/${streamId}.ts`
  },

  /**
   * 7. Orchestration complète et normalisation des flux en direct
   */
  async loadLiveContent(creds: XtreamCredentials): Promise<{
    channels: Channel[]
    categories: string[]
    counts: Record<string, number>
    userInfo?: XtreamUserInfo
  }> {
    const server = cleanServerUrl(creds.serverUrl)
    const user = encodeURIComponent(creds.username.trim())
    const pass = encodeURIComponent(creds.password.trim())

    // 1. Authentification
    const authResult = await this.authenticate(creds)

    // 2. Récupération des catégories
    const rawCategories = await this.getCategories(creds)
    const categoryMap = new Map<string, string>()
    for (const cat of rawCategories) {
      if (cat.category_id && cat.category_name) {
        categoryMap.set(String(cat.category_id), cat.category_name.trim())
      }
    }

    // 3. Récupération des flux Live (certains panels exigent une requête par catégorie)
    let rawStreams = await this.getLiveStreams(creds)
    if (rawStreams.length === 0 && rawCategories.length > 0) {
      const perCategory = await Promise.all(
        rawCategories.slice(0, 40).map((cat) => this.getLiveStreams(creds, String(cat.category_id)))
      )
      rawStreams = perCategory.flat()
    }

    if (rawStreams.length === 0) {
      throw new Error(
        'Aucune chaîne en direct trouvée sur ce compte Xtream Codes. Vérifiez votre abonnement.'
      )
    }

    // 4. Normalisation vers Channel
    const channels: Channel[] = rawStreams.map((stream, idx) => {
      const streamId = stream.stream_id
      const groupName = categoryMap.get(String(stream.category_id)) || 'Général'
      const streamUrlTs = `${server}/live/${user}/${pass}/${streamId}.ts`
      const streamUrlM3u8 = `${server}/live/${user}/${pass}/${streamId}.m3u8`
      const epgChannelId = stream.epg_channel_id || String(streamId)

      return {
        id: `xtream_${streamId}_${idx}`,
        name: stream.name?.trim() || `Chaîne ${streamId}`,
        logo: stream.stream_icon?.trim() || undefined,
        streamUrl: streamUrlTs,
        url: streamUrlTs,
        category: groupName,
        group: groupName,
        epgId: epgChannelId,
        tvgId: epgChannelId,
        tsUrl: streamUrlTs,
        m3u8Url: streamUrlM3u8,
        streamId,
        streamType: 'live',
        catchup: stream.tv_archive ? 'timeshift' : undefined,
        catchupDays: stream.tv_archive || undefined,
      }
    })

    // 5. Catégories triées par volume
    const counts: Record<string, number> = {}
    for (const ch of channels) {
      const grp = ch.category || 'Général'
      counts[grp] = (counts[grp] || 0) + 1
    }
    const categories = Object.keys(counts).sort((a, b) =>
      counts[b] !== counts[a] ? counts[b] - counts[a] : a.localeCompare(b)
    )

    return { channels, categories, counts, userInfo: authResult.userInfo }
  },
}
