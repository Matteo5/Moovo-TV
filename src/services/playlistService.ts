import parser from 'iptv-playlist-parser'
import type { Channel, DemoPlaylist } from '../types/iptv'

export const DEMO_PLAYLISTS: DemoPlaylist[] = [
  {
    id: 'iptv-org-full',
    title: 'IPTV-Org Mondiale (Officielle)',
    description: 'Index public mondial légal contenant des milliers de chaînes gratuites.',
    url: 'https://iptv-org.github.io/iptv/index.m3u',
    badge: 'Complète',
  },
  {
    id: 'iptv-org-fr',
    title: 'Chaînes Francophones (France & Monde)',
    description: 'Sélection des chaînes en français publiques (France 24, TV5 Monde, Arte, etc.).',
    url: 'https://iptv-org.github.io/iptv/countries/fr.m3u',
    badge: 'France',
    country: 'FR',
  },
  {
    id: 'iptv-org-news',
    title: 'Chaînes d\'Actualités Internationales',
    description: 'Flux continus d\'information (Euronews, Bloomberg, Sky News, France 24, etc.).',
    url: 'https://iptv-org.github.io/iptv/categories/news.m3u',
    badge: 'News',
  },
  {
    id: 'iptv-org-music',
    title: 'Chaînes Musicales & Live',
    description: 'Clips, concerts et lives musicaux 24/7 en streaming continu.',
    url: 'https://iptv-org.github.io/iptv/categories/music.m3u',
    badge: 'Musique',
  },
]

function generateChannelId(url: string, name: string, index: number): string {
  let hash = 0
  const str = `${url}__${name}__${index}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return `ch_${Math.abs(hash).toString(36)}_${index}`
}

/**
 * Dérive les URLs alternatives (.ts et .m3u8) pour le fallback du lecteur
 */
function deriveAlternateUrls(url: string): { m3u8Url: string; tsUrl: string } {
  let m3u8Url = url
  let tsUrl = url

  if (url.includes('.ts')) {
    m3u8Url = url.replace(/\.ts(\?|$)/i, '.m3u8$1')
  } else if (url.includes('.m3u8')) {
    tsUrl = url.replace(/\.m3u8(\?|$)/i, '.ts$1')
  }

  return { m3u8Url, tsUrl }
}

/**
 * Parseur M3U haute performance avec support des tags avancés :
 * - tvg-id, tvg-name, tvg-logo
 * - catchup="append", catchup-source
 * - balise #EXTGRP:
 * - Traitement asynchrone par lots (chunking) pour les fichiers lourds (> 20 Mo)
 */
export async function parseM3UAsync(
  m3uContent: string,
  onProgress?: (progress: number) => void
): Promise<Channel[]> {
  const lines = m3uContent.split(/\r?\n/)
  const totalLines = lines.length
  const channels: Channel[] = []

  let currentChannel: Partial<Channel> | null = null
  let currentGroupFromTag: string | null = null

  // Taille de lot pour éviter de bloquer l'UI
  const CHUNK_SIZE = 4000
  const isHeavy = m3uContent.length > 5 * 1024 * 1024 || totalLines > 10000

  for (let i = 0; i < totalLines; i++) {
    // Libération périodique du thread principal si le fichier est volumineux
    if (isHeavy && i % CHUNK_SIZE === 0 && i > 0) {
      if (onProgress) {
        onProgress(Math.round((i / totalLines) * 100))
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    const line = lines[i].trim()
    if (!line) continue

    // 1. Tag #EXTGRP (groupe spécifique défini sur sa propre ligne)
    if (line.startsWith('#EXTGRP:')) {
      const grp = line.substring(8).trim()
      if (grp) {
        currentGroupFromTag = grp
        if (currentChannel) {
          currentChannel.group = grp
        }
      }
      continue
    }

    // 2. Tag #EXTINF
    if (line.startsWith('#EXTINF:')) {
      // Nom de la chaîne après la dernière virgule
      const commaIndex = line.lastIndexOf(',')
      const name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : `Chaîne ${channels.length + 1}`

      // tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/) || line.match(/tvg-logo=([^\s]+)/)
      const logo = logoMatch ? logoMatch[1] : undefined

      // group-title
      const groupMatch = line.match(/group-title="([^"]+)"/) || line.match(/group-title=([^\s]+)/)
      const groupFromAttr = groupMatch ? groupMatch[1].trim() : undefined

      // tvg-id
      const idMatch = line.match(/tvg-id="([^"]+)"/) || line.match(/tvg-id=([^\s]+)/)
      const tvgId = idMatch ? idMatch[1].trim() : undefined

      // tvg-name
      const nameMatch = line.match(/tvg-name="([^"]+)"/) || line.match(/tvg-name=([^\s]+)/)
      const tvgName = nameMatch ? nameMatch[1].trim() : undefined

      // catchup
      const catchupMatch = line.match(/catchup="([^"]+)"/) || line.match(/catchup=([^\s]+)/)
      const catchup = catchupMatch ? catchupMatch[1].trim() : undefined

      const group = currentGroupFromTag || groupFromAttr || 'Général'

      currentChannel = {
        name,
        logo,
        group,
        tvgId,
        tvgName,
        catchup,
        raw: line,
      }
      currentGroupFromTag = null
    }
    // 3. Ligne d'URL (flux vidéo)
    else if (
      line.startsWith('http://') ||
      line.startsWith('https://') ||
      line.startsWith('rtmp://') ||
      line.startsWith('/')
    ) {
      if (currentChannel) {
        const url = line
        const id = generateChannelId(url, currentChannel.name || '', channels.length)
        const { m3u8Url, tsUrl } = deriveAlternateUrls(url)

        const group = currentChannel.group || 'Général'
        channels.push({
          id,
          name: currentChannel.name || `Chaîne ${channels.length + 1}`,
          logo: currentChannel.logo,
          streamUrl: url,
          url,
          category: group,
          group,
          epgId: currentChannel.tvgId,
          tvgId: currentChannel.tvgId,
          m3u8Url,
          tsUrl,
          tvgName: currentChannel.tvgName,
          catchup: currentChannel.catchup,
          raw: currentChannel.raw,
        })
        currentChannel = null
        currentGroupFromTag = null
      }
    }
  }

  return channels
}

/**
 * Fonction synchrone standard avec gestion de secours
 */
export function parseM3U(m3uContent: string): Channel[] {
  try {
    const parsed = parser.parse(m3uContent)
    if (parsed.items && parsed.items.length > 0) {
      return parsed.items
        .filter((item) => item.url && item.url.trim().length > 0)
        .map((item, index) => {
          const rawGroup = item.group?.title?.trim()
          const group = rawGroup && rawGroup.length > 0 ? rawGroup : 'Général'
          const name = item.name?.trim() || `Chaîne ${index + 1}`
          const url = item.url.trim()
          const id = generateChannelId(url, name, index)
          const { m3u8Url, tsUrl } = deriveAlternateUrls(url)

          return {
            id,
            name,
            logo: item.tvg?.logo || undefined,
            streamUrl: url,
            url,
            category: group,
            group,
            epgId: item.tvg?.id || undefined,
            tvgId: item.tvg?.id || undefined,
            m3u8Url,
            tsUrl,
            tvgName: item.tvg?.name || undefined,
            catchup: (item as any).catchup?.type || undefined,
            raw: item.raw,
          }
        })
    }
  } catch (error) {
    console.warn('Erreur avec iptv-playlist-parser, utilisation du parseur regex:', error)
  }

  // Fallback si la librairie standard a échoué
  const lines = m3uContent.split(/\r?\n/)
  const channels: Channel[] = []
  let currentChannel: Partial<Channel> | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    if (line.startsWith('#EXTINF:')) {
      const commaIndex = line.lastIndexOf(',')
      const name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : `Chaîne ${channels.length + 1}`
      const logoMatch = line.match(/tvg-logo="([^"]+)"/) || line.match(/tvg-logo=([^\s]+)/)
      const groupMatch = line.match(/group-title="([^"]+)"/) || line.match(/group-title=([^\s]+)/)
      const idMatch = line.match(/tvg-id="([^"]+)"/) || line.match(/tvg-id=([^\s]+)/)

      currentChannel = {
        name,
        logo: logoMatch ? logoMatch[1] : undefined,
        group: groupMatch ? groupMatch[1].trim() : 'Général',
        tvgId: idMatch ? idMatch[1].trim() : undefined,
        raw: line,
      }
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      if (currentChannel) {
        const url = line
        const id = generateChannelId(url, currentChannel.name || '', channels.length)
        const { m3u8Url, tsUrl } = deriveAlternateUrls(url)
        const group = currentChannel.group || 'Général'
        channels.push({
          id,
          name: currentChannel.name || `Chaîne ${channels.length + 1}`,
          logo: currentChannel.logo,
          streamUrl: url,
          url,
          category: group,
          group,
          epgId: currentChannel.tvgId,
          tvgId: currentChannel.tvgId,
          m3u8Url,
          tsUrl,
          raw: currentChannel.raw,
        })
        currentChannel = null
      }
    }
  }

  return channels
}

export function extractCategories(channels: Channel[]): {
  categories: string[]
  counts: Record<string, number>
} {
  const counts: Record<string, number> = {}

  for (const ch of channels) {
    const grp = ch.group || 'Général'
    counts[grp] = (counts[grp] || 0) + 1
  }

  const categories = Object.keys(counts).sort((a, b) => {
    if (counts[b] !== counts[a]) {
      return counts[b] - counts[a]
    }
    return a.localeCompare(b)
  })

  return { categories, counts }
}
