/**
 * Vérifie en une fraction de seconde qu'un fichier de film ou d'épisode existe encore chez le fournisseur,
 * avant de lancer la lecture. Beaucoup de catalogues Xtream gardent des fiches dont le fichier a disparu :
 * le serveur répond alors 503 ou 404 à toutes les méthodes de lecture, qui échouent l'une après l'autre.
 *
 * Seuls les deux premiers octets sont demandés (Range), via le proxy de l'application.
 */

export interface StreamCheck {
  /** Le fournisseur refuse ou ne trouve pas le fichier : inutile d'essayer de le lire. */
  gone: boolean
  status?: number
}

const CHECK_TIMEOUT_MS = 8000
const cache = new Map<string, { at: number; result: StreamCheck }>()
const CACHE_MS = 5 * 60_000

export async function checkStream(url: string, proxyQuery = ''): Promise<StreamCheck> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}${proxyQuery}`, {
      headers: { Range: 'bytes=0-1' },
      signal: controller.signal,
    })
    // Le corps ne sert à rien : on coupe la connexion tout de suite (l'abonnement n'en a souvent qu'une)
    controller.abort()
    const status = response.status
    const result: StreamCheck = { gone: status === 404 || status === 410 || status === 503 || status === 401 || status === 403, status }
    cache.set(url, { at: Date.now(), result })
    return result
  } catch {
    // Réseau lent ou proxy absent : on ne conclut rien, la lecture essaiera normalement
    return { gone: false }
  } finally {
    window.clearTimeout(timer)
  }
}

/** Avertissement de la fiche : le fichier du film, ou le premier épisode de la série, ne répond plus. */
export function unavailableNotice(type: 'movie' | 'series', status?: number): string {
  const code = status ? ` (erreur ${status})` : ''
  return type === 'series'
    ? `Votre fournisseur ne sert plus le premier épisode de cette série${code}. La série est encore listée dans son catalogue, mais ses fichiers semblent retirés de son serveur : d’autres épisodes peuvent manquer aussi.`
    : `Votre fournisseur ne sert plus ce film${code}. Il est encore listé dans son catalogue, mais son fichier semble retiré de son serveur.`
}

/** Message affiché quand le fournisseur refuse un fichier. */
export function goneMessage(status?: number): string {
  if (status === 401 || status === 403) {
    return 'Votre fournisseur refuse l’accès à ce titre (erreur ' + status + '). Vérifiez que votre abonnement est actif.'
  }
  if (status === 503) {
    return 'Votre fournisseur ne sert plus ce fichier (erreur 503). Le titre a sans doute été retiré de son serveur, ou votre abonnement est déjà utilisé sur un autre appareil. Essayez un autre épisode ou un autre titre.'
  }
  return 'Ce fichier n’existe plus chez votre fournisseur (erreur ' + (status ?? 404) + '). Le titre est encore listé dans son catalogue, mais il a été retiré de son serveur.'
}
