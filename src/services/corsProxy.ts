/**
 * Télécharge un texte (playlist M3U, guide XMLTV) :
 * 1. via le proxy intégré (serveur Moovo-TV en navigateur, proxy natif dans l'application) ;
 * 2. en direct si le serveur distant autorise lui-même les requêtes (ex. iptv-org).
 *
 * Aucun proxy public tiers n'est utilisé : les adresses de playlists contiennent souvent
 * l'identifiant et le mot de passe de l'abonnement.
 */
export async function fetchWithCors(
  url: string,
  _preferredProxyId: string = 'auto'
): Promise<{ text: string; proxyUsed: string }> {
  const attempts: { id: string; url: string }[] = [
    { id: 'local-proxy', url: `/api/proxy?url=${encodeURIComponent(url)}` },
    { id: 'direct', url },
  ]

  let lastError: Error | null = null

  for (const attempt of attempts) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)
    try {
      const response = await fetch(attempt.url, {
        signal: controller.signal,
        headers: { Accept: 'text/plain, application/x-mpegurl, audio/x-mpegurl, application/xml, */*' },
      })
      if (response.ok) {
        const text = await response.text()
        if (text && text.length > 20) return { text, proxyUsed: attempt.id }
        lastError = new Error('Le fichier reçu est vide.')
      } else {
        lastError = new Error(`Le serveur a répondu HTTP ${response.status}.`)
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw new Error(
    `Chargement impossible (${lastError?.message || 'serveur injoignable'}). Vérifiez l’adresse et votre connexion.`
  )
}
