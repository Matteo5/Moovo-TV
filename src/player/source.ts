import type { Channel } from '../types/iptv'
import type { PlaybackSource } from './engine'
import { useIptvStore } from '../store/useIptvStore'
import { stalkerService } from '../services/stalkerService'

/**
 * Prépare la source de lecture d'une chaîne :
 * - portails MAG / Stalker : échange de la commande provisoire contre un lien signé (create_link)
 *   et lecture via le proxy avec l'identité du décodeur (MAC, user-agent MAG) ;
 * - autres sources : URLs telles quelles.
 */
export async function resolvePlaybackSource(channel: Channel): Promise<PlaybackSource> {
  const isLive = !channel.streamType || channel.streamType === 'live'
  const base: PlaybackSource = {
    url: channel.streamUrl || channel.url,
    tsUrl: channel.tsUrl,
    m3u8Url: channel.m3u8Url,
    isLive,
  }

  const { connectionMode, stalkerCreds, stalkerToken } = useIptvStore.getState()
  if (connectionMode !== 'stalker' || !stalkerCreds || !channel.raw) return base

  const proxyQuery = stalkerService.proxyQuery(stalkerCreds, stalkerToken)
  if (!stalkerToken) return { ...base, proxyQuery }

  try {
    const url = await stalkerService.createLink(stalkerCreds, stalkerToken, channel.raw)
    return {
      url,
      tsUrl: /\.m3u8(\?|$)/i.test(url) ? undefined : url,
      m3u8Url: /\.m3u8(\?|$)/i.test(url) ? url : undefined,
      isLive,
      proxyQuery,
    }
  } catch (err) {
    // Certains portails donnent directement l'URL finale dans la liste : on la tente telle quelle
    console.warn('[Stalker] create_link indisponible, lecture de l’URL de la liste :', err)
    return { ...base, proxyQuery }
  }
}
