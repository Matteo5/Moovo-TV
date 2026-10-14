import type { Channel, EnigmaCredentials } from '../types/iptv'

/**
 * Normalise l'URL hôte du décodeur Enigma2
 */
export function cleanEnigmaHost(input: string): { host: string; webPort: number; protocol: string } {
  let cleaned = input.trim()
  let protocol = 'http'

  if (cleaned.startsWith('https://')) {
    protocol = 'https'
    cleaned = cleaned.replace(/^https:\/\//, '')
  } else if (cleaned.startsWith('http://')) {
    cleaned = cleaned.replace(/^http:\/\//, '')
  }

  cleaned = cleaned.replace(/\/+$/, '')

  const parts = cleaned.split(':')
  const host = parts[0]
  const webPort = parts[1] ? parseInt(parts[1], 10) || 80 : 80

  return { host, webPort, protocol }
}

export const enigmaService = {
  /**
   * Récupère le XML d'un endpoint OpenWebif via le proxy local Vite
   */
  async fetchWebif(hostUrl: string, endpoint: string): Promise<Document> {
    const { host, webPort, protocol } = cleanEnigmaHost(hostUrl)
    const targetUrl = `${protocol}://${host}:${webPort}${endpoint}`
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`

    console.log('[Enigma2] Appel Webif :', targetUrl)

    const response = await fetch(proxyUrl, {
      headers: {
        Accept: 'text/xml, application/xml, */*',
      },
    })

    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Décodeur Enigma2 HTTP ${response.status} : ${text.slice(0, 120)}`)
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')

    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      throw new Error('Le décodeur Enigma2 n\'a pas renvoyé un flux XML valide.')
    }

    return doc
  },

  /**
   * Récupère l'arborescence complète des bouquets et services via /web/getallservices
   */
  async getAllServices(creds: EnigmaCredentials): Promise<{
    channels: Channel[]
    categories: string[]
    counts: Record<string, number>
  }> {
    const { host, webPort, protocol } = cleanEnigmaHost(creds.hostUrl)
    const streamPort = creds.streamPort || 8001

    let doc: Document
    try {
      doc = await this.fetchWebif(creds.hostUrl, '/web/getallservices')
    } catch (err) {
      console.warn('[Enigma2] /web/getallservices a échoué, tentative avec /web/getservices...', err)
      return this.getServicesFallback(creds)
    }

    const channels: Channel[] = []
    const counts: Record<string, number> = {}

    // Les bouquets sont des balises <e2service> contenant des sous-listes <e2servicelist>
    const bouquetElements = Array.from(doc.querySelectorAll('e2servicelist > e2service'))

    for (const bElem of bouquetElements) {
      const bouquetName = bElem.querySelector('e2servicename')?.textContent?.trim() || 'Favoris'
      const subServices = Array.from(bElem.querySelectorAll('e2servicelist > e2service'))

      for (const sElem of subServices) {
        const sRef = sElem.querySelector('e2servicereference')?.textContent?.trim()
        const sName = sElem.querySelector('e2servicename')?.textContent?.trim()

        // Ignorer les séparateurs ou marqueurs Enigma2 (<MARKER>)
        if (!sRef || !sName || sRef.startsWith('1:64:') || sRef.includes('ORDER BY')) {
          continue
        }

        const streamUrl = `${protocol}://${host}:${streamPort}/${sRef}`
        const cleanRef = sRef.replace(/[:]/g, '_').replace(/_+$/, '')
        const piconUrl = `${protocol}://${host}:${webPort}/picon/${cleanRef}.png`

        counts[bouquetName] = (counts[bouquetName] || 0) + 1

        channels.push({
          id: `e2_${cleanRef}`,
          name: sName,
          logo: piconUrl,
          streamUrl,
          url: streamUrl,
          category: bouquetName,
          group: bouquetName,
          epgId: sRef,
          tvgId: sRef,
          streamId: sRef,
          streamType: 'live',
          tsUrl: streamUrl,
          m3u8Url: streamUrl,
        })
      }
    }

    if (channels.length === 0) {
      throw new Error(
        'Aucun service TV trouvé sur le décodeur Enigma2. Vérifiez que vos bouquets sont bien configurés.'
      )
    }

    const categories = Object.keys(counts).sort((a, b) => counts[b] - counts[a])

    return { channels, categories, counts }
  },

  /**
   * Fallback via /web/getservices pour les images Enigma2 anciennes
   */
  async getServicesFallback(creds: EnigmaCredentials): Promise<{
    channels: Channel[]
    categories: string[]
    counts: Record<string, number>
  }> {
    const { host, webPort, protocol } = cleanEnigmaHost(creds.hostUrl)
    const streamPort = creds.streamPort || 8001

    const doc = await this.fetchWebif(creds.hostUrl, '/web/getservices')
    const bouquetNodes = Array.from(doc.querySelectorAll('e2service'))

    const channels: Channel[] = []
    const counts: Record<string, number> = {}

    for (const bNode of bouquetNodes.slice(0, 10)) {
      const bRef = bNode.querySelector('e2servicereference')?.textContent?.trim()
      const bName = bNode.querySelector('e2servicename')?.textContent?.trim() || 'Bouquet'

      if (!bRef) continue

      try {
        const subDoc = await this.fetchWebif(
          creds.hostUrl,
          `/web/getservices?sRef=${encodeURIComponent(bRef)}`
        )
        const sNodes = Array.from(subDoc.querySelectorAll('e2service'))

        for (const sNode of sNodes) {
          const sRef = sNode.querySelector('e2servicereference')?.textContent?.trim()
          const sName = sNode.querySelector('e2servicename')?.textContent?.trim()

          if (!sRef || !sName || sRef.startsWith('1:64:')) continue

          const streamUrl = `${protocol}://${host}:${streamPort}/${sRef}`
          const cleanRef = sRef.replace(/[:]/g, '_').replace(/_+$/, '')
          const piconUrl = `${protocol}://${host}:${webPort}/picon/${cleanRef}.png`

          counts[bName] = (counts[bName] || 0) + 1

          channels.push({
            id: `e2_${cleanRef}`,
            name: sName,
            logo: piconUrl,
            streamUrl,
            url: streamUrl,
            category: bName,
            group: bName,
            epgId: sRef,
            tvgId: sRef,
            streamId: sRef,
            streamType: 'live',
            tsUrl: streamUrl,
            m3u8Url: streamUrl,
          })
        }
      } catch (subErr) {
        console.warn(`[Enigma2] Échec chargement bouquet ${bName} :`, subErr)
      }
    }

    if (channels.length === 0) {
      throw new Error('Aucune chaîne trouvée via l\'API Enigma2.')
    }

    const categories = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
    return { channels, categories, counts }
  },
}
