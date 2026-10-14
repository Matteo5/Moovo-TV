import type Hls from 'hls.js'
import type { TsPlayerSession } from '../services/tsTransmuxer'
import { isNativeApp } from '../native'
import { getPlaybackPrefs, hlsBufferConfig, languageMatches, languageName } from '../services/playbackPrefs'

/**
 * Moteur de lecture Moovo-TV.
 *
 * Essaie automatiquement, dans l'ordre, les méthodes de lecture adaptées au flux :
 *   HLS (hls.js) → MPEG-TS transmuxé (mux.js) → lecture native → mêmes méthodes via le proxy.
 * hls.js et mux.js ne sont téléchargés qu'au premier besoin.
 */

export interface PlaybackSource {
  url: string
  tsUrl?: string
  m3u8Url?: string
  isLive: boolean
  /** Paramètres ajoutés aux URLs du proxy (ex. identité MAG : &mac=…&token=…). Impose le proxy en premier. */
  proxyQuery?: string
}

export interface EngineCallbacks {
  onBuffering: (buffering: boolean) => void
  onAttempt: (label: string) => void
  onFatal: (message: string) => void
  /** Pistes audio / sous-titres disponibles ou modifiées. */
  onTracksChange?: () => void
}

export interface MediaTrack {
  id: number
  label: string
  lang?: string
  active: boolean
}

export interface EngineSession {
  destroy: () => void
  retry: () => void
  getTracks: () => { audio: MediaTrack[]; subtitles: MediaTrack[] }
  setAudioTrack: (id: number) => void
  /** -1 = sous-titres désactivés */
  setSubtitleTrack: (id: number) => void
}

type Method = 'hls' | 'ts' | 'native'

interface Attempt {
  method: Method
  url: string
  label: string
}

const ATTEMPT_TIMEOUT_MS = 15_000

const proxied = (url: string, query = '') => `/api/proxy?url=${encodeURIComponent(url)}${query}`

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url)
const isTs = (url: string) => /\.ts(\?|$)/i.test(url)

let hlsModule: Promise<typeof import('hls.js')> | null = null
const loadHls = () => (hlsModule ??= import('hls.js'))

/** Liste ordonnée des tentatives pour un flux donné, sans doublons. */
export function planAttempts(
  source: PlaybackSource,
  pageIsHttps = location.protocol === 'https:',
  proxyFirst = isNativeApp || !!source.proxyQuery
): Attempt[] {
  const attempts: Attempt[] = []
  const seen = new Set<string>()
  const push = (method: Method, url: string | undefined, label: string) => {
    if (!url) return
    const key = `${method}|${url}`
    if (seen.has(key)) return
    seen.add(key)
    attempts.push({ method, url, label })
  }

  const main = source.url
  const m3u8 = source.m3u8Url || (isHls(main) ? main : undefined)
  const ts = source.tsUrl || (isTs(main) ? main : undefined)

  // Une page https ne peut pas charger un flux http : inutile d'essayer en direct
  const insecure = (url: string) => pageIsHttps && url.startsWith('http:')

  const direct = (method: Method, url: string | undefined, label: string) => {
    if (url && !insecure(url)) push(method, url, label)
  }
  const viaProxy = (method: Method, url: string | undefined, label: string) => {
    if (url) push(method, proxied(url, source.proxyQuery), `${label} · proxy`)
  }

  if (!source.isLive && !isHls(main)) {
    // Film / épisode : fichier progressif, le proxy relaie les requêtes Range pour l'avance rapide
    direct('native', main, 'Fichier')
    viaProxy('native', main, 'Fichier')
    return attempts
  }

  // Dans l'application native, le proxy est local et sans limite CORS : on commence par lui
  const pair = (method: Method, url: string | undefined, label: string) => {
    if (proxyFirst) {
      viaProxy(method, url, label)
      direct(method, url, label)
    } else {
      direct(method, url, label)
      viaProxy(method, url, label)
    }
  }

  if (ts && !isHls(main)) {
    pair('ts', ts, 'MPEG-TS')
    pair('hls', m3u8, 'HLS')
  } else {
    pair('hls', m3u8 || main, 'HLS')
    pair('ts', ts, 'MPEG-TS')
  }
  direct('native', main, 'Natif')
  viaProxy('native', main, 'Natif')
  return attempts
}

export function startPlayback(
  video: HTMLVideoElement,
  source: PlaybackSource,
  callbacks: EngineCallbacks,
  startAt = 0
): EngineSession {
  const attempts = planAttempts(source)
  let index = -1
  let destroyed = false
  let hls: Hls | null = null
  let ts: TsPlayerSession | null = null
  let timeout: number | undefined
  let ready = false
  let detachVideoListeners: (() => void) | null = null

  const teardown = () => {
    window.clearTimeout(timeout)
    detachVideoListeners?.()
    detachVideoListeners = null
    if (hls) {
      hls.destroy()
      hls = null
    }
    if (ts) {
      ts.destroy()
      ts = null
    }
    video.removeAttribute('src')
    try {
      video.load()
    } catch {
      // Élément déjà détaché
    }
  }

  const play = () => {
    video.play().catch((err: unknown) => {
      // Lecture automatique refusée par le navigateur : le flux est bon, l'utilisateur relancera
      if ((err as DOMException)?.name === 'NotAllowedError') {
        callbacks.onBuffering(false)
      }
    })
  }

  const next = () => {
    if (destroyed) return
    teardown()
    index += 1
    ready = false
    const attempt = attempts[index]
    if (!attempt) {
      callbacks.onBuffering(false)
      callbacks.onFatal(
        source.isLive
          ? 'Ce flux ne répond pas. La chaîne est peut-être hors ligne ou votre abonnement a atteint sa limite de connexions.'
          : 'Ce titre ne peut pas être lu. Le fichier est peut-être indisponible ou dans un format non pris en charge par ce navigateur.'
      )
      return
    }

    callbacks.onAttempt(attempt.label)
    callbacks.onBuffering(true)

    // Sans image au bout du délai, on passe à la méthode suivante
    timeout = window.setTimeout(() => {
      if (!ready) next()
    }, ATTEMPT_TIMEOUT_MS)

    const onReady = () => {
      if (ready) return
      ready = true
      window.clearTimeout(timeout)
      callbacks.onBuffering(false)
    }
    const onWaiting = () => ready && callbacks.onBuffering(true)
    const onPlaying = () => {
      onReady()
      callbacks.onBuffering(false)
    }
    const onError = () => {
      if (attempt.method !== 'hls') next()
    }
    const onLoadedMeta = () => {
      if (startAt > 0 && !source.isLive && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(startAt, Math.max(0, video.duration - 5))
      }
    }

    video.addEventListener('playing', onPlaying)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('error', onError)
    video.addEventListener('loadedmetadata', onLoadedMeta)
    detachVideoListeners = () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onLoadedMeta)
    }

    if (attempt.method === 'native') {
      video.src = attempt.url
      play()
      return
    }

    if (attempt.method === 'ts') {
      void import('../services/tsTransmuxer').then(({ playTsWithMux }) => {
        if (destroyed || attempts[index] !== attempt) return
        ts = playTsWithMux(video, attempt.url, {
          onReady: () => play(),
          onError: () => next(),
        })
      })
      return
    }

    // HLS
    void loadHls().then(({ default: HlsCtor }) => {
      if (destroyed || attempts[index] !== attempt) return
      if (!HlsCtor.isSupported()) {
        // Safari / iOS : HLS natif
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = attempt.url
          play()
        } else {
          next()
        }
        return
      }

      const prefs = getPlaybackPrefs()
      const instance = new HlsCtor({
        enableWorker: true,
        lowLatencyMode: source.isLive && prefs.buffer === 'short',
        ...hlsBufferConfig(prefs.buffer, source.isLive),
        manifestLoadingMaxRetry: 1,
        startPosition: startAt > 0 ? startAt : -1,
      })
      hls = instance
      let mediaRecoveries = 0

      instance.on(HlsCtor.Events.MANIFEST_PARSED, () => play())
      // Langue audio et sous-titres par défaut (réglages)
      instance.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, () => {
        const wanted = instance.audioTracks.findIndex((t) => languageMatches(t.lang || t.name, prefs.audioLang))
        if (wanted >= 0 && wanted !== instance.audioTrack) instance.audioTrack = wanted
        callbacks.onTracksChange?.()
      })
      instance.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, () => {
        const wanted = prefs.subtitleLang === 'off' ? -1 : instance.subtitleTracks.findIndex((t) => languageMatches(t.lang || t.name, prefs.subtitleLang))
        instance.subtitleDisplay = wanted >= 0
        instance.subtitleTrack = wanted
        callbacks.onTracksChange?.()
      })
      instance.on(HlsCtor.Events.AUDIO_TRACK_SWITCHED, () => callbacks.onTracksChange?.())
      instance.on(HlsCtor.Events.SUBTITLE_TRACK_SWITCH, () => callbacks.onTracksChange?.())
      instance.on(HlsCtor.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries += 1
          instance.recoverMediaError()
          return
        }
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && ready) {
          // Coupure en cours de lecture : on relance le chargement plutôt que de changer de méthode
          instance.startLoad()
          return
        }
        next()
      })
      instance.loadSource(attempt.url)
      instance.attachMedia(video)
    })
  }

  // Sous-titres intégrés aux fichiers (lecture native) : piste par défaut selon les réglages
  const applyNativeTextDefaults = () => {
    const pref = getPlaybackPrefs().subtitleLang
    const tracks = Array.from(video.textTracks).filter((t) => t.kind === 'subtitles' || t.kind === 'captions')
    let chosen = false
    for (const t of tracks) {
      const match = !chosen && pref !== 'off' && languageMatches(t.language || t.label, pref)
      t.mode = match ? 'showing' : 'disabled'
      if (match) chosen = true
    }
    callbacks.onTracksChange?.()
  }
  video.textTracks.addEventListener?.('addtrack', applyNativeTextDefaults)

  next()

  const nativeTextTracks = () =>
    Array.from(video.textTracks).filter((t) => t.kind === 'subtitles' || t.kind === 'captions')

  return {
    destroy: () => {
      destroyed = true
      video.textTracks.removeEventListener?.('addtrack', applyNativeTextDefaults)
      teardown()
    },
    retry: () => {
      index = -1
      next()
    },
    getTracks: () => {
      if (hls) {
        return {
          audio: hls.audioTracks.map((t, i) => ({ id: i, label: t.name || languageName(t.lang), lang: t.lang, active: i === hls!.audioTrack })),
          subtitles: hls.subtitleTracks.map((t, i) => ({
            id: i,
            label: t.name || languageName(t.lang),
            lang: t.lang,
            active: hls!.subtitleDisplay && i === hls!.subtitleTrack,
          })),
        }
      }
      return {
        audio: [],
        subtitles: nativeTextTracks().map((t, i) => ({ id: i, label: t.label || languageName(t.language), lang: t.language, active: t.mode === 'showing' })),
      }
    },
    setAudioTrack: (id) => {
      if (hls) hls.audioTrack = id
      callbacks.onTracksChange?.()
    },
    setSubtitleTrack: (id) => {
      if (hls) {
        hls.subtitleDisplay = id >= 0
        hls.subtitleTrack = id
      } else {
        nativeTextTracks().forEach((t, i) => (t.mode = i === id ? 'showing' : 'disabled'))
      }
      callbacks.onTracksChange?.()
    },
  }
}
