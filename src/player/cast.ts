import { isNativeApp } from '../native'

/**
 * Diffusion Chromecast via le kit officiel Google Cast (lecteur multimédia par défaut).
 * Le Chromecast télécharge lui-même le flux : il lui faut une URL qu'il peut joindre
 * (HLS de préférence ; le MPEG-TS brut n'est pas pris en charge par le lecteur par défaut).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void
    cast?: any
    chrome?: any
  }
}

const SENDER_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
let loading: Promise<boolean> | null = null

/** Le kit Cast fonctionne dans Chrome et Edge (bureau, Android), pas dans l'application native. */
export function castSupported(): boolean {
  if (isNativeApp) return false
  const ua = navigator.userAgent
  return /Chrome\/|Edg\//.test(ua) && !/OPR\/|SamsungBrowser/.test(ua)
}

export function loadCastSdk(): Promise<boolean> {
  if (loading) return loading
  loading = new Promise<boolean>((resolve) => {
    if (window.cast?.framework) {
      resolve(true)
      return
    }
    const timer = window.setTimeout(() => resolve(false), 10_000)
    window.__onGCastApiAvailable = (available) => {
      window.clearTimeout(timer)
      if (available) {
        window.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        })
      }
      resolve(available)
    }
    const script = document.createElement('script')
    script.src = SENDER_URL
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timer)
      resolve(false)
    }
    document.head.appendChild(script)
  })
  return loading
}

export interface CastRequest {
  url: string
  m3u8Url?: string
  isLive: boolean
  title: string
  subtitle?: string
  image?: string
  startTime?: number
}

function contentTypeOf(url: string): string {
  if (/\.m3u8(\?|$)/i.test(url)) return 'application/x-mpegurl'
  if (/\.mp4(\?|$)/i.test(url)) return 'video/mp4'
  if (/\.mkv(\?|$)/i.test(url)) return 'video/x-matroska'
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm'
  if (/\.ts(\?|$)/i.test(url)) return 'video/mp2t'
  return 'application/x-mpegurl'
}

// Une page servie sur le réseau local (pas localhost) peut prêter son proxy au Chromecast (en-têtes CORS)
function castableUrl(url: string): string {
  const host = location.hostname
  const lanReachable = host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.localhost')
  return lanReachable ? `${location.origin}/api/proxy?url=${encodeURIComponent(url)}` : url
}

/** Ouvre le sélecteur d'appareils puis lance la lecture. Renvoie le nom de l'appareil. */
export async function castMedia(req: CastRequest): Promise<string> {
  const ok = await loadCastSdk()
  if (!ok) throw new Error('Le module Chromecast n’a pas pu être chargé. Utilisez Chrome ou Edge, connecté à Internet.')

  const { cast, chrome } = window
  const context = cast.framework.CastContext.getInstance()
  try {
    await context.requestSession()
  } catch (err) {
    // Fenêtre fermée sans choisir d'appareil
    if (err === 'cancel' || (err as { code?: string })?.code === 'cancel') throw new Error('cancel')
    throw new Error('Aucun Chromecast trouvé sur votre réseau.')
  }

  const session = context.getCurrentSession()
  // HLS de préférence : le lecteur par défaut du Chromecast ne lit pas le MPEG-TS brut
  const source = req.m3u8Url || req.url
  const media = new chrome.cast.media.MediaInfo(castableUrl(source), contentTypeOf(source))
  media.streamType = req.isLive ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED
  const meta = new chrome.cast.media.GenericMediaMetadata()
  meta.title = req.title
  if (req.subtitle) meta.subtitle = req.subtitle
  if (req.image) meta.images = [new chrome.cast.Image(req.image)]
  media.metadata = meta

  const load = new chrome.cast.media.LoadRequest(media)
  load.autoplay = true
  if (req.startTime && !req.isLive) load.currentTime = req.startTime

  try {
    await session.loadMedia(load)
  } catch {
    throw new Error('Le Chromecast n’a pas pu lire ce flux : le serveur IPTV refuse sans doute la lecture depuis un autre appareil.')
  }
  return session.getCastDevice()?.friendlyName || 'Chromecast'
}

export function stopCasting() {
  window.cast?.framework?.CastContext.getInstance().endCurrentSession(true)
}

/** Prévient quand la diffusion s'arrête (depuis le téléphone, la TV ou une coupure). */
export function onCastEnded(callback: () => void): () => void {
  const framework = window.cast?.framework
  if (!framework) return () => {}
  const context = framework.CastContext.getInstance()
  const handler = (e: { sessionState: string }) => {
    if (e.sessionState === framework.SessionState.SESSION_ENDED) callback()
  }
  context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, handler)
  return () => context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, handler)
}
