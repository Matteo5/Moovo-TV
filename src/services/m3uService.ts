import type { Channel } from '../types/iptv'
import { fetchWithCors } from './corsProxy'
import { parseM3UAsync, extractCategories } from './playlistService'

export interface M3UParseResult {
  channels: Channel[]
  categories: string[]
  categoryCounts: Record<string, number>
}

export const m3uService = {
  /**
   * Télécharge une playlist M3U/M3U8 distante (avec contournement CORS) et parse son contenu
   */
  async loadFromUrl(
    url: string,
    preferredProxy: string = 'auto',
    onProgress?: (progress: number) => void
  ): Promise<M3UParseResult> {
    const { text } = await fetchWithCors(url, preferredProxy)
    return this.parseContent(text, onProgress)
  },

  /**
   * Parse le contenu d'un fichier M3U (texte brut ou upload local)
   */
  async parseContent(
    content: string,
    onProgress?: (progress: number) => void
  ): Promise<M3UParseResult> {
    const rawChannels = await parseM3UAsync(content, onProgress)

    // Normalisation stricte de l'interface Channel
    const normalizedChannels: Channel[] = rawChannels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      logo: ch.logo,
      streamUrl: ch.streamUrl || ch.url,
      url: ch.url || ch.streamUrl,
      category: ch.category || ch.group || 'Général',
      group: ch.group || ch.category || 'Général',
      epgId: ch.epgId || ch.tvgId,
      tvgId: ch.tvgId || ch.epgId,
      streamId: ch.streamId,
      streamType: ch.streamType || 'live',
      tsUrl: ch.tsUrl,
      m3u8Url: ch.m3u8Url,
      tvgName: ch.tvgName,
      country: ch.country,
      language: ch.language,
      catchup: ch.catchup,
      raw: ch.raw,
    }))

    const { categories, counts } = extractCategories(normalizedChannels)

    return {
      channels: normalizedChannels,
      categories,
      categoryCounts: counts,
    }
  },
}
