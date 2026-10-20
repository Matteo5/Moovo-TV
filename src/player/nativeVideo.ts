import type { PluginListenerHandle } from '@capacitor/core'
import { MoovoNative, nativePlatform, type NativeTrack, type NativeVideoEvent } from '../native'
import { getPlaybackPrefs } from '../services/playbackPrefs'
import type { EngineCallbacks, EngineSession, MediaTrack, PlaybackSource } from './engine'

/** Android (téléphone, Android TV, Fire TV) : décodage par ExoPlayer, sous la WebView. */
export const nativeVideoAvailable = nativePlatform === 'android'

/** Sans première image au bout de ce délai, on repasse sur les lecteurs web */
const START_TIMEOUT_MS = 20_000

// Propriétés de <video> remplacées le temps de la lecture native
const SHIMMED = ['currentTime', 'duration', 'paused', 'ended', 'readyState', 'videoWidth', 'videoHeight', 'buffered', 'volume', 'muted', 'play', 'pause'] as const

function proxyParam(query: string | undefined, name: string): string | undefined {
  if (!query) return undefined
  const match = new RegExp(`[?&]${name}=([^&]*)`).exec(query)
  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * Lecture native : le lecteur de l'application (commandes, zapping, télécommande) pilote ExoPlayer comme
 * s'il s'agissait de l'élément <video> : ses propriétés (temps, durée, pause, volume) et ses événements
 * (timeupdate, playing, waiting, ended…) sont relayés depuis le lecteur natif. La page devient transparente
 * autour du lecteur (classe native-video sur <html>) pour laisser voir l'image décodée dessous.
 *
 * onFail : le flux ne démarre pas en natif ; le moteur repasse alors sur hls.js / mpegts.js.
 */
export function startNativePlayback(
  video: HTMLVideoElement,
  source: PlaybackSource,
  callbacks: EngineCallbacks,
  startAt: number,
  onFail: () => void
): EngineSession {
  const state = { time: startAt, duration: NaN, buffered: 0, paused: false, ended: false, buffering: true }
  let volume = video.volume
  let muted = video.muted
  let ready = false
  let finished = false
  let tracks: { audio: MediaTrack[]; subtitles: MediaTrack[] } = { audio: [], subtitles: [] }
  let listener: PluginListenerHandle | null = null
  let startTimer: number | undefined

  const fire = (type: string) => video.dispatchEvent(new Event(type))
  const sendVolume = () => void MoovoNative.videoVolume({ volume, muted }).catch(() => {})

  const descriptors: Record<(typeof SHIMMED)[number], PropertyDescriptor> = {
    currentTime: {
      get: () => state.time,
      set: (value: number) => {
        state.time = value
        fire('seeking')
        void MoovoNative.videoSeek({ time: value }).catch(() => {})
      },
    },
    duration: { get: () => (source.isLive ? Infinity : state.duration) },
    paused: { get: () => state.paused },
    ended: { get: () => state.ended },
    readyState: { get: () => (ready ? 4 : 0) },
    videoWidth: { get: () => (ready ? 1920 : 0) },
    videoHeight: { get: () => (ready ? 1080 : 0) },
    buffered: { get: () => ({ length: state.buffered > 0 ? 1 : 0, start: () => 0, end: () => state.buffered }) },
    volume: {
      get: () => volume,
      set: (value: number) => {
        volume = value
        sendVolume()
        fire('volumechange')
      },
    },
    muted: {
      get: () => muted,
      set: (value: boolean) => {
        muted = value
        sendVolume()
        fire('volumechange')
      },
    },
    play: {
      value: () => {
        state.paused = false
        fire('play')
        return MoovoNative.videoPlay().catch(() => {})
      },
    },
    pause: {
      value: () => {
        state.paused = true
        fire('pause')
        void MoovoNative.videoPause().catch(() => {})
      },
    },
  }
  for (const key of SHIMMED) Object.defineProperty(video, key, { ...descriptors[key], configurable: true })

  const unshim = () => {
    for (const key of SHIMMED) delete (video as unknown as Record<string, unknown>)[key]
    document.documentElement.classList.remove('native-video')
  }

  const refreshTracks = () => {
    void MoovoNative.videoTracks().then((result) => {
      const map = (list: NativeTrack[] | undefined) => (list || []).map((t) => ({ id: t.id, label: t.label, lang: t.lang, active: t.active }))
      tracks = { audio: map(result.audio), subtitles: map(result.subtitles) }
      callbacks.onTracksChange?.()
    })
  }

  const markReady = () => {
    if (ready || finished) return
    ready = true
    window.clearTimeout(startTimer)
    callbacks.onBuffering(false)
    fire('loadedmetadata')
    fire('loadeddata')
    fire('playing')
  }

  // Abandon du lecteur natif : on rend l'élément <video> au moteur web
  const giveUp = () => {
    if (finished) return
    finished = true
    window.clearTimeout(startTimer)
    void listener?.remove()
    void MoovoNative.videoStop().catch(() => {})
    unshim()
    onFail()
  }

  const onEvent = (event: NativeVideoEvent) => {
    if (finished) return
    switch (event.type) {
      case 'firstFrame':
        markReady()
        break
      case 'tracks':
        refreshTracks()
        break
      case 'ended':
        state.ended = true
        fire('ended')
        break
      case 'error':
        if (!ready && !event.played) {
          giveUp()
        } else {
          callbacks.onBuffering(false)
          callbacks.onFatal(
            source.isLive
              ? 'Ce flux ne répond plus. La chaîne est peut-être hors ligne ou votre abonnement a atteint sa limite de connexions.'
              : 'La lecture s’est interrompue. Le fichier est peut-être indisponible chez le fournisseur.'
          )
        }
        break
      case 'state': {
        if (event.playing) markReady()
        const duration = event.duration !== undefined && event.duration >= 0 ? event.duration : NaN
        if (!Number.isNaN(duration) && duration !== state.duration) {
          state.duration = duration
          fire('durationchange')
        }
        if (event.buffered !== undefined) state.buffered = event.buffered
        if (event.time !== undefined && event.time !== state.time) {
          state.time = event.time
          fire('timeupdate')
        }
        const paused = !!event.paused
        if (paused !== state.paused) {
          state.paused = paused
          fire(paused ? 'pause' : 'play')
        }
        const buffering = !!event.buffering
        if (ready && buffering !== state.buffering) {
          callbacks.onBuffering(buffering)
          fire(buffering ? 'waiting' : 'playing')
        }
        state.buffering = buffering
        if (event.ended && !state.ended && !source.isLive) {
          state.ended = true
          fire('ended')
        }
        break
      }
    }
  }

  const load = () => {
    ready = false
    state.ended = false
    callbacks.onAttempt('Lecteur natif')
    callbacks.onBuffering(true)
    window.clearTimeout(startTimer)
    startTimer = window.setTimeout(() => {
      if (!ready) giveUp()
    }, START_TIMEOUT_MS)

    // Direct : flux .ts en priorité (moins de latence), variante HLS en secours ; film : l'URL telle quelle
    const ts = source.tsUrl || (/\.ts(\?|$)/i.test(source.url) ? source.url : undefined)
    const main = source.isLive ? ts || source.url : source.url
    const fallback = source.isLive && source.m3u8Url && source.m3u8Url !== main ? source.m3u8Url : undefined
    const prefs = getPlaybackPrefs()
    void MoovoNative.videoLoad({
      url: main,
      fallbackUrl: fallback,
      live: source.isLive,
      startAt: source.isLive ? 0 : startAt,
      mac: proxyParam(source.proxyQuery, 'mac'),
      token: proxyParam(source.proxyQuery, 'token'),
      audioLang: prefs.audioLang,
      subtitleLang: prefs.subtitleLang,
    }).catch(() => giveUp())
    sendVolume()
  }

  document.documentElement.classList.add('native-video')
  void MoovoNative.addListener('videoEvent', onEvent).then((handle) => {
    if (finished) void handle.remove()
    else listener = handle
  })
  load()

  return {
    destroy: () => {
      if (finished) return
      finished = true
      window.clearTimeout(startTimer)
      void listener?.remove()
      void MoovoNative.videoStop().catch(() => {})
      unshim()
    },
    retry: () => {
      if (!finished) load()
    },
    getTracks: () => tracks,
    setAudioTrack: (id) => {
      void MoovoNative.videoSelectTrack({ kind: 'audio', id }).then(refreshTracks)
    },
    setSubtitleTrack: (id) => {
      void MoovoNative.videoSelectTrack({ kind: 'text', id }).then(refreshTracks)
    },
  }
}
