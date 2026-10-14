import type { Channel, StalkerCredentials } from '../types/iptv'

/**
 * Génère une adresse MAC aléatoire valide pour décodeur MAG (préfixe officiel Infomir 00:1A:79)
 */
export function generateRandomMac(): string {
  const hexPart = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()

  return `00:1A:79:${hexPart()}:${hexPart()}:${hexPart()}`
}

/**
 * Nettoie l'URL du portail Stalker/Ministra pour obtenir la base du serveur
 */
export function cleanPortalUrl(url: string): string {
  let cleaned = url.trim()
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`
  }
  // Retirer les terminaisons courantes /c, /c/, /server/load.php
  return cleaned
    .replace(/\/c(\/index\.html)?\/?$/i, '')
    .replace(/\/server\/load\.php\/?$/i, '')
    .replace(/\/+$/, '')
}

/**
 * Envoie une requête à l'API Stalker Ministra via le proxy local Vite
 */
async function fetchStalkerApi(
  portalBase: string,
  params: Record<string, string>,
  mac: string,
  token?: string
): Promise<any> {
  const query = new URLSearchParams({
    ...params,
    JsHttpRequest: '1-xml',
  }).toString()

  const targetUrl = `${portalBase}/server/load.php?${query}`
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}&mac=${encodeURIComponent(
    mac
  )}${token ? `&token=${encodeURIComponent(token)}` : ''}`

  console.log('[Stalker API] Envoi requête :', targetUrl)

  const response = await fetch(proxyUrl, {
    headers: {
      'x-stalker-mac': mac,
      ...(token ? { 'x-stalker-token': token } : {}),
      Accept: 'application/json, text/javascript, */*',
    },
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Portail Stalker HTTP ${response.status} : ${text.slice(0, 150)}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `Le portail Stalker n'a pas répondu en JSON valide. Réponse reçue : ${text.slice(0, 200)}`
    )
  }
}

/**
 * Extrait l'URL HTTP directe depuis la commande de flux Stalker
 * Exemple : "ffmpeg http://srv.com/live/1.ts" -> "http://srv.com/live/1.ts"
 */
function extractStreamUrlFromCmd(cmd: string): string {
  if (!cmd) return ''
  const trimmed = cmd.trim()
  const httpIndex = trimmed.indexOf('http://')
  const httpsIndex = trimmed.indexOf('https://')

  if (httpIndex !== -1) {
    return trimmed.substring(httpIndex).split(/\s+/)[0]
  }
  if (httpsIndex !== -1) {
    return trimmed.substring(httpsIndex).split(/\s+/)[0]
  }
  return trimmed
}

export const stalkerService = {
  /**
   * Lien de lecture signé d'une chaîne. La plupart des portails renvoient dans la liste une commande
   * provisoire (« ffmpeg http://localhost/ch/123_ ») qui doit être échangée au moment de la lecture.
   */
  async createLink(creds: StalkerCredentials, token: string, cmd: string): Promise<string> {
    const data = await fetchStalkerApi(
      cleanPortalUrl(creds.portalUrl),
      { type: 'itv', action: 'create_link', cmd, series: '', forced_storage: '0', disable_ad: '0', download: '0' },
      creds.macAddress.trim(),
      token
    )
    const url = extractStreamUrlFromCmd(String(data?.js?.cmd || ''))
    if (!url) throw new Error('Le portail n’a pas fourni de lien de lecture pour cette chaîne.')
    return url
  },

  /** Paramètres à ajouter au proxy pour que le flux soit demandé avec l'identité du décodeur MAG. */
  proxyQuery(creds: StalkerCredentials, token?: string | null): string {
    return `&mac=${encodeURIComponent(creds.macAddress.trim())}${token ? `&token=${encodeURIComponent(token)}` : ''}`
  },

  /**
   * 1. Handshake & Authentification initiale avec le portail Stalker
   */
  async handshake(creds: StalkerCredentials): Promise<{ token: string; random: string }> {
    const portalBase = cleanPortalUrl(creds.portalUrl)
    const mac = creds.macAddress.trim()

    const data = await fetchStalkerApi(
      portalBase,
      {
        type: 'stb',
        action: 'handshake',
        token: '',
      },
      mac
    )

    const token = data?.js?.token
    const random = data?.js?.random || ''

    if (!token) {
      throw new Error(
        `Échec du Handshake Stalker. Le portail n'a pas retourné de jeton de session. Vérifiez l'adresse MAC (${mac}) ou l'URL du portail.`
      )
    }

    console.log('[Stalker] Handshake réussi, token session obtenu :', token)
    return { token, random }
  },

  /**
   * 2. Profil STB
   */
  async getProfile(creds: StalkerCredentials, token: string): Promise<any> {
    const portalBase = cleanPortalUrl(creds.portalUrl)
    const mac = creds.macAddress.trim()

    const data = await fetchStalkerApi(
      portalBase,
      {
        type: 'stb',
        action: 'get_profile',
      },
      mac,
      token
    )

    return data?.js || {}
  },

  /**
   * 3. Récupération des genres / catégories
   */
  async getGenres(
    creds: StalkerCredentials,
    token: string
  ): Promise<Array<{ id: string; title: string }>> {
    const portalBase = cleanPortalUrl(creds.portalUrl)
    const mac = creds.macAddress.trim()

    try {
      const data = await fetchStalkerApi(
        portalBase,
        {
          type: 'itv',
          action: 'get_genres',
        },
        mac,
        token
      )

      const raw = data?.js
      if (Array.isArray(raw)) {
        return raw.map((g: any) => ({
          id: String(g.id),
          title: String(g.title || g.alias || 'Général').trim(),
        }))
      }
      return []
    } catch (err) {
      console.warn('[Stalker] Impossible de récupérer les genres :', err)
      return []
    }
  },

  /**
   * 4. Récupération de toutes les chaînes
   */
  async getAllChannels(
    creds: StalkerCredentials,
    token: string
  ): Promise<any[]> {
    const portalBase = cleanPortalUrl(creds.portalUrl)
    const mac = creds.macAddress.trim()

    // Tentative 1 : get_all_channels
    try {
      const data = await fetchStalkerApi(
        portalBase,
        {
          type: 'itv',
          action: 'get_all_channels',
        },
        mac,
        token
      )

      const list = data?.js?.data
      if (Array.isArray(list) && list.length > 0) {
        return list
      }
    } catch {
      console.warn('[Stalker] Échec get_all_channels, tentative fallback get_ordered_list...')
    }

    // Tentative 2 : get_ordered_list
    try {
      const data = await fetchStalkerApi(
        portalBase,
        {
          type: 'itv',
          action: 'get_ordered_list',
          genre: '0',
          force_ch_link_check: '0',
        },
        mac,
        token
      )

      const list = data?.js?.data
      if (Array.isArray(list) && list.length > 0) {
        return list
      }
    } catch (err) {
      console.error('[Stalker] Échec get_ordered_list :', err)
    }

    return []
  },

  /**
   * 5. Chargement complet et normalisation vers l'interface Channel
   */
  async loadContent(creds: StalkerCredentials): Promise<{
    channels: Channel[]
    categories: string[]
    counts: Record<string, number>
    token: string
  }> {
    const portalBase = cleanPortalUrl(creds.portalUrl)

    // 1. Handshake
    const { token } = await this.handshake(creds)

    // 2. Profil
    await this.getProfile(creds, token)

    // 3. Genres
    const genres = await this.getGenres(creds, token)
    const genreMap = new Map<string, string>()
    for (const g of genres) {
      genreMap.set(g.id, g.title)
    }

    // 4. Chaînes
    const rawChannels = await this.getAllChannels(creds, token)

    if (rawChannels.length === 0) {
      throw new Error(
        'Aucune chaîne trouvée sur ce portail Stalker. Vérifiez que votre adresse MAC est bien autorisée sur le serveur.'
      )
    }

    // 5. Normalisation vers Channel
    const channels: Channel[] = rawChannels.map((item: any, idx: number) => {
      const chId = String(item.id || item.number || idx)
      const rawCmd = String(item.cmd || '')
      const streamUrl = extractStreamUrlFromCmd(rawCmd)
      const genreId = String(item.tv_genre_id || '')
      const categoryName = genreMap.get(genreId) || 'Général'

      let logoUrl = item.logo ? String(item.logo).trim() : undefined
      if (logoUrl && !logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) {
        logoUrl = `${portalBase}/${logoUrl.replace(/^\/+/, '')}`
      }

      const epgChannelId = item.xmltv_id || item.name || chId

      return {
        id: `stk_${chId}_${idx}`,
        name: String(item.name || `Chaîne ${chId}`).trim(),
        logo: logoUrl,
        streamUrl,
        url: streamUrl,
        category: categoryName,
        group: categoryName,
        epgId: epgChannelId,
        tvgId: epgChannelId,
        streamId: chId,
        streamType: 'live',
        raw: rawCmd,
        tsUrl: streamUrl,
        m3u8Url: streamUrl.includes('.ts') ? streamUrl.replace(/\.ts(\?|$)/i, '.m3u8$1') : streamUrl,
      }
    })

    // 6. Catégories et comptage
    const counts: Record<string, number> = {}
    for (const ch of channels) {
      const grp = ch.category || 'Général'
      counts[grp] = (counts[grp] || 0) + 1
    }

    const categories = Object.keys(counts).sort((a, b) => {
      if (counts[b] !== counts[a]) {
        return counts[b] - counts[a]
      }
      return a.localeCompare(b)
    })

    return {
      channels,
      categories,
      counts,
      token,
    }
  },
}
