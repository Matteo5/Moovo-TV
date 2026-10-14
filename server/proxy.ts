import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * Proxy CORS Moovo-TV, partagé entre le serveur de dev Vite et le serveur de production.
 *
 * GET|POST|HEAD /api/proxy?url=<cible>[&mac=<MAC Stalker>][&token=<jeton Stalker>]
 *
 * - Diffuse la réponse en streaming (indispensable pour les flux MPEG-TS en direct, qui ne finissent jamais).
 * - Relaie l'en-tête Range pour permettre l'avance rapide dans les films VOD.
 * - Réécrit les playlists HLS (#EXT-X-*) pour que segments, clés et sous-playlists passent aussi par le proxy.
 */

const CONNECT_TIMEOUT_MS = 20_000
const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024

const STB_USER_AGENT =
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
const DEFAULT_USER_AGENT = 'IPTVSmartersPro'

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
]

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
}

function sendJsonError(res: ServerResponse, status: number, error: string, code = '') {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.statusCode = status
  setCorsHeaders(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error, code }))
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return chunks.length ? Buffer.concat(chunks) : undefined
}

function buildProxyUrl(target: string, passthrough: URLSearchParams): string {
  const params = new URLSearchParams(passthrough)
  params.set('url', target)
  return `/api/proxy?${params.toString()}`
}

/** Réécrit chaque URI d'une playlist HLS en URL absolue proxifiée. */
export function rewriteHlsPlaylist(body: string, baseUrl: string, passthrough: URLSearchParams): string {
  const resolve = (uri: string) => {
    try {
      return buildProxyUrl(new URL(uri, baseUrl).toString(), passthrough)
    } catch {
      return uri
    }
  }

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        // URI="..." dans EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, EXT-X-I-FRAME-STREAM-INF...
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${resolve(uri)}"`)
      }
      return resolve(trimmed)
    })
    .join('\n')
}

function looksLikePlaylist(targetUrl: string, contentType: string): boolean {
  return /mpegurl/i.test(contentType) || /\.m3u8?(\?|$)/i.test(new URL(targetUrl).pathname)
}

export function createProxyHandler() {
  return async function proxyHandler(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      setCorsHeaders(res)
      res.end()
      return
    }

    const parsedUrl = new URL(req.url || '', 'http://localhost')
    const targetUrl = parsedUrl.searchParams.get('url')

    if (!targetUrl) {
      sendJsonError(res, 400, 'Paramètre url manquant.')
      return
    }

    let target: URL
    try {
      target = new URL(targetUrl)
    } catch {
      sendJsonError(res, 400, 'URL cible invalide.')
      return
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      sendJsonError(res, 400, 'Seuls les protocoles http et https sont acceptés.')
      return
    }

    const mac = parsedUrl.searchParams.get('mac') || (req.headers['x-stalker-mac'] as string | undefined)
    const token = parsedUrl.searchParams.get('token') || (req.headers['x-stalker-token'] as string | undefined)

    // Paramètres à propager dans les URLs réécrites des playlists HLS
    const passthrough = new URLSearchParams()
    if (mac) passthrough.set('mac', mac)
    if (token) passthrough.set('token', token)

    const headers: Record<string, string> = {
      'User-Agent': mac ? STB_USER_AGENT : DEFAULT_USER_AGENT,
      Accept: '*/*',
    }
    if (mac) {
      headers['Cookie'] = `mac=${mac}; stb_lang=en; timezone=Europe%2FParis`
      headers['X-User-Agent'] = 'Model: MAG250; Link: Ethernet'
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (req.headers.range) headers['Range'] = req.headers.range
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type']

    const method = req.method === 'POST' ? 'POST' : req.method === 'HEAD' ? 'HEAD' : 'GET'
    const body = method === 'POST' ? await readRequestBody(req) : undefined

    // Coupe la requête amont si le client se déconnecte (zapping, fermeture du lecteur)
    const upstreamAbort = new AbortController()
    const onClientClose = () => upstreamAbort.abort()
    res.on('close', onClientClose)
    const connectTimer = setTimeout(() => upstreamAbort.abort(), CONNECT_TIMEOUT_MS)

    let upstream: Response
    try {
      upstream = await fetch(target, {
        method,
        headers,
        body,
        redirect: 'follow',
        signal: upstreamAbort.signal,
      })
    } catch (err: unknown) {
      clearTimeout(connectTimer)
      if (res.destroyed) return
      const cause = (err as { cause?: { code?: string } })?.cause?.code || ''
      const message = err instanceof Error ? err.message : 'Proxy fetch failed'
      const timedOut = upstreamAbort.signal.aborted
      sendJsonError(
        res,
        timedOut ? 504 : 502,
        timedOut
          ? 'Le serveur distant ne répond pas (délai dépassé).'
          : `Échec de connexion au serveur (${cause || message}).`,
        cause
      )
      return
    }
    clearTimeout(connectTimer)

    const contentType = upstream.headers.get('content-type') || ''
    setCorsHeaders(res)
    res.statusCode = upstream.status

    try {
      if (method !== 'HEAD' && upstream.ok && looksLikePlaylist(upstream.url || targetUrl, contentType)) {
        const declaredLength = Number(upstream.headers.get('content-length') || 0)
        if (declaredLength <= MAX_PLAYLIST_BYTES) {
          const text = await upstream.text()
          const isHls = text.includes('#EXT-X-')
          const out = isHls ? rewriteHlsPlaylist(text, upstream.url || targetUrl, passthrough) : text
          res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl')
          res.setHeader('Cache-Control', 'no-store')
          res.end(out)
          return
        }
      }

      // fetch décompresse le corps : la taille annoncée ne vaut que sans Content-Encoding
      const isEncoded = !!upstream.headers.get('content-encoding')
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        if (isEncoded && name === 'content-length') continue
        const value = upstream.headers.get(name)
        if (value) res.setHeader(name, value)
      }
      if (!contentType) res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-store')

      if (!upstream.body || method === 'HEAD') {
        res.end()
        return
      }

      await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream), res)
    } catch {
      // Déconnexion du client ou coupure du flux amont : rien à renvoyer.
      if (!res.headersSent) sendJsonError(res, 502, 'Flux interrompu par le serveur distant.')
      else res.destroy()
    } finally {
      res.off('close', onClientClose)
    }
  }
}
