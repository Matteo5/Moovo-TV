import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ChevronUp,
  ChevronDown,
  List,
  Heart,
  Cast,
  PictureInPicture2,
  Grid2X2,
  RotateCcw,
  RotateCw,
  Settings2,
  Languages,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { episodeLabel, useIptvStore } from '../store/useIptvStore'
import type { Channel, QualityVariant } from '../types/iptv'
import { startPlayback, type EngineSession, type MediaTrack } from './engine'
import { resolvePlaybackSource } from './source'
import { castSupported, castMedia, stopCasting, onCastEnded } from './cast'
import { ChannelDrawer } from './ChannelDrawer'
import { Multiview } from './Multiview'
import { storageService } from '../services/storageService'
import { extractCleanBaseName } from '../services/channelGroupingService'
import { useBackHandler, goBack } from '../hooks/useBackHandler'
import { useDigitEntry } from '../hooks/useDigitEntry'
import { useUpcoming } from '../hooks/useUpcoming'
import { useNow } from '../hooks/useNow'
import { focusFirstIn } from '../hooks/useSpatialNavigation'
import { ChannelLogo } from '../ui/ChannelLogo'
import { BrandMark } from '../ui/Brand'
import { Button } from '../ui/Button'
import { OnAirDot, ProgressLine, formatTime, programProgress } from '../ui/Program'
import { DigitOsd } from '../app/Shell'
import { isNativeApp } from '../native'

// Délai avant masquage des commandes : plus long sur TV, où l'on navigue à la télécommande
const HIDE_AFTER_MS = typeof document !== 'undefined' && document.documentElement.dataset.device === 'tv' ? 6500 : 4000
const RESUME_SAVE_MS = 10_000

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--'
  const s = Math.floor(totalSeconds % 60)
  const m = Math.floor((totalSeconds / 60) % 60)
  const h = Math.floor(totalSeconds / 3600)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Recherche d'une chaîne miroir (même nom, autre flux) quand le direct tombe
function findMirror(channel: Channel, channels: Channel[], tried: ReadonlySet<string>): Channel | null {
  const base = extractCleanBaseName(channel.name).toLowerCase()
  let best: Channel | null = null
  let bestScore = 0
  for (const c of channels) {
    if (c.id === channel.id || c.streamUrl === channel.streamUrl || tried.has(c.id)) continue
    const cand = extractCleanBaseName(c.name).toLowerCase()
    let score = cand === base ? 1 : cand.includes(base) || base.includes(cand) ? 0.8 : 0
    if (score > 0 && (c.group || c.category) === (channel.group || channel.category)) score += 0.1
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return bestScore >= 0.8 ? best : null
}

type VideoWithRemote = HTMLVideoElement & {
  remote?: { prompt: () => Promise<void> }
  webkitShowPlaybackTargetPicker?: () => void
}

/** Secondes avant de lancer l'épisode suivant en fin d'épisode */
const NEXT_EPISODE_DELAY = 8

const PlayerScreen: React.FC = () => {
  const channel = useIptvStore((s) => s.activeChannel)!
  const channels = useIptvStore((s) => s.channels)
  const isFavorite = useIptvStore((s) => s.favorites.includes(channel.vodId ? channel.vodId.split('_ep_')[0] : channel.id))
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const playNextChannel = useIptvStore((s) => s.playNextChannel)
  const playPreviousChannel = useIptvStore((s) => s.playPreviousChannel)
  const playChannelNumber = useIptvStore((s) => s.playChannelNumber)
  const saveResumePoint = useIptvStore((s) => s.saveResumePoint)
  const clearResumePoint = useIptvStore((s) => s.clearResumePoint)
  const episodeContext = useIptvStore((s) => s.episodeContext)
  const playNextEpisode = useIptvStore((s) => s.playNextEpisode)
  // Épisode suivant de la série en cours (enchaînement automatique en fin d'épisode)
  const nextEpisode =
    episodeContext && channel.vodId === `${episodeContext.item.id}_ep_${episodeContext.episode.id}` ? episodeContext.next : null
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0) {
      setNextCountdown(null)
      playNextEpisode()
      return
    }
    const timer = window.setTimeout(() => setNextCountdown((n) => (n === null ? null : n - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [nextCountdown, playNextEpisode])

  // Nouvel épisode ou nouvelle chaîne : pas de compte à rebours en cours
  useEffect(() => setNextCountdown(null), [channel.id])

  const isLive = !channel.streamType || channel.streamType === 'live'
  const isReplay = channel.name.startsWith('[Replay]')
  const canZap = isLive && !isReplay

  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<VideoWithRemote | null>(null)
  const sessionRef = useRef<EngineSession | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  // Dernière position connue : au démontage, la vidéo est déjà détachée quand on enregistre la reprise
  const lastTimeRef = useRef({ current: 0, duration: 0 })
  // Flux déjà essayés lors des bascules automatiques (évite l'aller-retour entre deux miroirs en panne)
  const triedMirrorsRef = useRef(new Set<string>())
  const mirrorSwitchRef = useRef(false)

  const [buffering, setBuffering] = useState(true)
  const [attempt, setAttempt] = useState('')
  const [fatal, setFatal] = useState<string | null>(null)
  const [mirrorNotice, setMirrorNotice] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(storageService.getMuted())
  const [volume, setVolume] = useState(storageService.getVolume())
  const [controls, setControls] = useState(true)
  const controlsRef = useRef(true)
  controlsRef.current = controls
  const [drawer, setDrawer] = useState(false)
  const drawerRef = useRef(false)
  drawerRef.current = drawer
  const [qualityMenu, setQualityMenu] = useState(false)
  const [tracksMenu, setTracksMenu] = useState(false)
  const [castingTo, setCastingTo] = useState<string | null>(null)
  const [tracks, setTracks] = useState<{ audio: MediaTrack[]; subtitles: MediaTrack[] }>({ audio: [], subtitles: [] })
  const [multiview, setMultiview] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [time, setTime] = useState({ current: 0, duration: 0 })
  const [zapOsd, setZapOsd] = useState(true)
  const now = useNow(15_000)

  const upcoming = useUpcoming(isLive && !isReplay ? channel : null, 3)
  const nowProgram =
    (isReplay ? channel.currentProgram : undefined) ||
    upcoming.find((p) => p.start.getTime() <= now && p.stop.getTime() > now) ||
    channel.currentProgram
  const nextProgram = upcoming.find((p) => p.start.getTime() > now)

  // Retour : masque d'abord les commandes (TiviMate, Google TV), puis ferme le lecteur
  useBackHandler(
    true,
    () => setActiveChannel(null),
    () => {
      if (!controlsRef.current || drawerRef.current) return false
      window.clearTimeout(hideTimer.current)
      setControls(false)
      ;(document.activeElement as HTMLElement | null)?.blur()
      return true
    }
  )

  // Ferme le lecteur et tout ce qui est ouvert par-dessus (tiroir, menu qualité)
  const closePlayer = useCallback(() => setActiveChannel(null), [setActiveChannel])

  // ── Affichage des commandes ─────────────────────────────────
  const revealControls = useCallback(() => {
    setControls(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setControls(false), HIDE_AFTER_MS)
  }, [])

  useEffect(() => {
    revealControls()
    return () => window.clearTimeout(hideTimer.current)
  }, [revealControls])

  // Garde les commandes visibles tant qu'un menu est ouvert ou que la lecture est en pause
  useEffect(() => {
    if (drawer || qualityMenu || tracksMenu || paused || fatal) {
      window.clearTimeout(hideTimer.current)
      setControls(true)
    } else {
      revealControls()
    }
  }, [drawer, qualityMenu, tracksMenu, paused, fatal, revealControls])

  // OSD de zapping : numéro et nom pendant 3 secondes à chaque changement de chaîne
  useEffect(() => {
    setZapOsd(true)
    const id = window.setTimeout(() => setZapOsd(false), 3500)
    return () => window.clearTimeout(id)
  }, [channel.id])

  // ── Moteur de lecture ───────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    // En multiview, chaque case a son propre moteur : celui-ci doit être arrêté
    if (!video || multiview) return
    setFatal(null)
    setMirrorNotice(null)
    lastTimeRef.current = { current: 0, duration: 0 }
    // Changement choisi par l'utilisateur : on repart de zéro ; bascule automatique : on garde la mémoire
    if (!mirrorSwitchRef.current) triedMirrorsRef.current.clear()
    mirrorSwitchRef.current = false
    triedMirrorsRef.current.add(channel.id)
    setTracks({ audio: [], subtitles: [] })
    setTime({ current: 0, duration: 0 })

    let mirrorTimer: number | undefined
    let cancelled = false
    let session: EngineSession | null = null
    setBuffering(true)
    setAttempt('Connexion')

    void resolvePlaybackSource(channel).then((source) => {
      if (cancelled) return
      session = startPlayback(
      video,
      source,
      {
        onBuffering: setBuffering,
        onAttempt: setAttempt,
        onTracksChange: () => {
          const current = sessionRef.current
          if (current) setTracks(current.getTracks())
        },
        onFatal: (message) => {
          const mirror = canZap ? findMirror(channel, useIptvStore.getState().channels, triedMirrorsRef.current) : null
          if (mirror) {
            setMirrorNotice(`Flux indisponible, bascule sur ${mirror.name}…`)
            mirrorTimer = window.setTimeout(() => {
              mirrorSwitchRef.current = true
              setActiveChannel(mirror)
            }, 1400)
          } else {
            setFatal(message)
          }
        },
      },
      channel.resumeFrom || 0,
      { native: true }
      )
      sessionRef.current = session
    })
    return () => {
      cancelled = true
      window.clearTimeout(mirrorTimer)
      session?.destroy()
      sessionRef.current = null
    }
    // L'identité de la chaîne et ses URLs suffisent à relancer le moteur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, channel.streamUrl, channel.tsUrl, channel.m3u8Url, multiview])

  // Volume
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.volume = volume
      video.muted = muted
    }
    storageService.setVolume(volume)
    storageService.setMuted(muted)
  }, [volume, muted])

  // ── Reprise des films et épisodes ───────────────────────────
  const persistResume = useCallback(() => {
    if (isLive || !channel.vodId) return
    const video = videoRef.current
    const { current: currentTime, duration } = video ? { current: video.currentTime, duration: video.duration } : lastTimeRef.current
    if (!Number.isFinite(duration) || duration <= 0 || currentTime < 5) return
    if (currentTime > duration - 90 || currentTime / duration > 0.95) clearResumePoint(channel.vodId)
    else saveResumePoint(channel.vodId, currentTime, duration)
  }, [isLive, channel.vodId, saveResumePoint, clearResumePoint])

  useEffect(() => {
    if (isLive) return
    const id = window.setInterval(persistResume, RESUME_SAVE_MS)
    return () => {
      window.clearInterval(id)
      persistResume()
    }
  }, [isLive, persistResume])

  // ── Actions ─────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }, [])

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta))
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen()
        .then(() => {
          const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
          orientation.lock?.('landscape').catch(() => {})
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const togglePip = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      // Incrustation refusée (flux sans image ou navigateur non compatible)
    }
  }

  // Chromecast (Chrome / Edge) et AirPlay (Safari)
  const chromecast = castSupported()
  const airplay = typeof window !== 'undefined' && 'webkitShowPlaybackTargetPicker' in HTMLVideoElement.prototype
  const startCast = async () => {
    const video = videoRef.current
    if (!video) return
    if (!chromecast) {
      video.webkitShowPlaybackTargetPicker?.()
      return
    }
    try {
      const device = await castMedia({
        url: channel.streamUrl || channel.url,
        m3u8Url: channel.m3u8Url,
        isLive,
        title: channel.name.replace('[Replay] ', ''),
        subtitle: nowProgram?.title || channel.subtitle,
        image: channel.logo,
        startTime: video.currentTime,
      })
      video.pause()
      setCastingTo(device)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Diffusion impossible.'
      if (message !== 'cancel') {
        setMirrorNotice(message)
        window.setTimeout(() => setMirrorNotice(null), 6000)
      }
    }
  }
  const endCast = useCallback(() => {
    stopCasting()
    setCastingTo(null)
    videoRef.current?.play().catch(() => {})
  }, [])
  useEffect(() => (castingTo ? onCastEnded(() => setCastingTo(null)) : undefined), [castingTo])

  const selectQuality = (variant: QualityVariant) => {
    setQualityMenu(false)
    setActiveChannel({
      ...channel,
      streamUrl: variant.streamUrl,
      url: variant.streamUrl,
      tsUrl: variant.tsUrl || (/\.ts(\?|$)/.test(variant.streamUrl) ? variant.streamUrl : undefined),
      m3u8Url: variant.m3u8Url || (/\.m3u8(\?|$)/.test(variant.streamUrl) ? variant.streamUrl : undefined),
      selectedQuality: variant.quality,
    })
  }

  // Réaffiche les commandes et place le focus (bouton lecture, ou barre de progression)
  const showControlsAndFocus = useCallback(
    (selector: string) => {
      revealControls()
      window.setTimeout(() => {
        const target = containerRef.current?.querySelector<HTMLElement>(selector)
        if (target) target.focus({ preventScroll: true })
        else focusFirstIn(containerRef.current || document)
      }, 30)
    },
    [revealControls]
  )

  // ── Saisie d'un numéro + touches ────────────────────────────
  const pendingUnlock = useIptvStore((s) => s.pendingUnlock)
  const digits = useDigitEntry(canZap && !drawer && !multiview && !pendingUnlock, (num) => {
    if (!playChannelNumber(num)) revealControls()
  })
  const typedChannel = digits ? channels.find((c) => c.number === parseInt(digits, 10)) : undefined

  useEffect(() => {
    if (multiview) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range')) return
      // Code parental demandé par-dessus le lecteur : les touches lui reviennent
      if (drawer || qualityMenu || tracksMenu || useIptvStore.getState().pendingUnlock) return

      const key = e.key
      const handled = () => {
        e.preventDefault()
        e.stopPropagation()
      }

      // Touches valables en permanence
      if (key === ' ' || key === 'k' || key === 'MediaPlayPause') {
        handled()
        togglePlay()
        revealControls()
        return
      }
      if (key === 'MediaPlay') return handled(), videoRef.current?.play().catch(() => {})
      if (key === 'MediaPause' || key === 'MediaStop') return handled(), videoRef.current?.pause()
      if (key === 'm' || key === 'M' || key === 'AudioVolumeMute') return handled(), setMuted((v) => !v)
      if (key === 'f' || key === 'F') return handled(), toggleFullscreen()
      if (canZap && (key === 'ChannelUp' || key === 'PageUp' || key === 'MediaTrackNext')) return handled(), playNextChannel()
      if (canZap && (key === 'ChannelDown' || key === 'PageDown' || key === 'MediaTrackPrevious')) return handled(), playPreviousChannel()
      if (!isLive && (key === 'MediaFastForward')) return handled(), seekBy(30)
      if (!isLive && (key === 'MediaRewind')) return handled(), seekBy(-30)

      if (controls) {
        // Commandes visibles : les flèches parcourent les boutons (navigation spatiale)
        revealControls()
        return
      }

      // Commandes masquées (comme TiviMate) : Haut / Bas changent de chaîne (la télécommande Fire TV
      // n'a pas de touches CH+ / CH−), Gauche ouvre la liste, OK et Droite affichent les commandes.
      if (canZap && (key === 'ArrowUp' || key === 'ArrowDown')) {
        handled()
        if (key === 'ArrowUp') playNextChannel()
        else playPreviousChannel()
        return
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        handled()
        if (isLive) {
          if (key === 'ArrowLeft' && canZap) setDrawer(true)
          else showControlsAndFocus('[data-autofocus]')
        } else {
          // Film / épisode (comme Netflix) : avance ou recul de 10 s, barre de progression affichée
          seekBy(key === 'ArrowLeft' ? -10 : 10)
          showControlsAndFocus('[data-seekbar]')
        }
        return
      }
      if (key === 'Enter' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'i') {
        handled()
        showControlsAndFocus('[data-autofocus]')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [multiview, drawer, qualityMenu, tracksMenu, controls, canZap, isLive, togglePlay, toggleFullscreen, revealControls, seekBy, playNextChannel, playPreviousChannel, showControlsAndFocus])

  // ── Intégrations système : écran verrouillé, veille ─────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowProgram?.title || channel.subtitle || channel.name,
      artist: channel.name.replace('[Replay] ', ''),
      album: 'Moovo TV',
      artwork: channel.logo ? [{ src: channel.logo, sizes: '512x512' }] : [],
    })
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => videoRef.current?.play()],
      ['pause', () => videoRef.current?.pause()],
      ['nexttrack', canZap ? () => playNextChannel() : null],
      ['previoustrack', canZap ? () => playPreviousChannel() : null],
      ['seekforward', !isLive ? () => seekBy(30) : null],
      ['seekbackward', !isLive ? () => seekBy(-10) : null],
    ]
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Action non prise en charge par ce navigateur
      }
    }
  }, [channel, nowProgram?.title, canZap, isLive, playNextChannel, playPreviousChannel, seekBy])

  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = () => {
      if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [])

  if (multiview) {
    return <Multiview initial={channel} onClose={() => setMultiview(false)} />
  }

  const showChrome = controls || !!fatal
  const progress = time.duration > 0 ? (time.current / time.duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      data-nav-trap
      data-player-root
      role="dialog"
      aria-label={`Lecture : ${channel.name}`}
      onPointerMove={(e) => e.pointerType === 'mouse' && revealControls()}
      className={`fixed inset-0 z-[60] overflow-hidden bg-black text-paper ${showChrome ? '' : 'cursor-none'}`}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="absolute inset-0 size-full object-contain"
        onPointerUp={(e) => {
          // Souris : clic = pause/lecture. Tactile : appui = afficher/masquer les commandes
          if (e.pointerType === 'mouse') {
            if (controls) togglePlay()
            else revealControls()
          } else if (controls) {
            window.clearTimeout(hideTimer.current)
            setControls(false)
          } else {
            revealControls()
          }
        }}
        onEnded={() => nextEpisode && setNextCountdown(NEXT_EPISODE_DELAY)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => {
          if (isLive) return
          const t = { current: e.currentTarget.currentTime, duration: e.currentTarget.duration }
          lastTimeRef.current = t
          setTime(t)
        }}
        onDurationChange={(e) => {
          const duration = e.currentTarget.duration
          if (!isLive) setTime((t) => ({ ...t, duration }))
        }}
      />

      {/* Chargement : la mire cherche le signal */}
      {buffering && !fatal && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/35">
          <BrandMark pulse className="h-20" />
          <p className="font-display text-sm font-semibold text-mist">{attempt || 'Connexion'}</p>
        </div>
      )}

      {/* Diffusion en cours sur un Chromecast */}
      {castingTo && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-ink-950/95 px-6 text-center">
          <Cast className="size-12 text-accent" />
          <p className="font-wide text-2xl font-bold">Diffusion sur {castingTo}</p>
          <p className="max-w-md text-mist">{channel.name.replace('[Replay] ', '')} est lu sur votre téléviseur.</p>
          <Button variant="primary" onClick={endCast}>
            Arrêter la diffusion
          </Button>
        </div>
      )}

      {mirrorNotice && (
        <div className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full bg-ink-950/90 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 animate-rise">
          {mirrorNotice}
        </div>
      )}

      {/* OSD de zapping (visible même commandes masquées) */}
      {zapOsd && !showChrome && (
        <div className="pointer-events-none absolute left-[max(var(--gutter),env(safe-area-inset-left))] top-[calc(var(--gutter)+env(safe-area-inset-top))] flex items-center gap-5 rounded-2xl bg-ink-950/75 py-4 pl-4 pr-7 ring-1 ring-white/10 backdrop-blur-xl animate-rise">
          <ChannelLogo logo={channel.logo} name={channel.name} className="size-14" />
          <div>
            {channel.number && <p className="font-mono text-3xl font-bold leading-none text-accent tabular">{String(channel.number).padStart(3, '0')}</p>}
            <p className="mt-1 font-wide text-lg font-bold">{channel.name}</p>
          </div>
        </div>
      )}

      {/* Bandeau supérieur */}
      <div
        className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/90 via-black/50 to-transparent pl-[max(var(--gutter),env(safe-area-inset-left))] pr-[max(var(--gutter),env(safe-area-inset-right))] pb-20 pt-[calc(var(--gutter)+env(safe-area-inset-top))] transition-opacity duration-300 ${
          showChrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex items-start gap-5">
          <ChannelLogo logo={channel.logo} name={channel.name} className="hidden size-16 shrink-0 sm:flex" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {isLive && !isReplay && <OnAirDot />}
              {isReplay && <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand-cyan">Replay</span>}
              {channel.number && !isReplay && (
                <span className="font-mono text-sm font-bold text-accent tabular">CH {String(channel.number).padStart(3, '0')}</span>
              )}
              {channel.selectedQuality && channel.qualities && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.7rem] font-bold">{channel.selectedQuality}</span>
              )}
            </div>
            <h1 className="mt-1.5 truncate font-xwide text-2xl font-extrabold tracking-tight md:text-3xl">
              {channel.name.replace('[Replay] ', '')}
            </h1>
            {nowProgram ? (
              <p className="mt-1 truncate text-mist">
                <span className="font-semibold text-paper">{nowProgram.title}</span>
                {nextProgram && (
                  <span className="hidden md:inline">
                    <span className="mx-3 text-fog">›</span>
                    <span className="font-mono text-sm text-fog tabular">{formatTime(nextProgram.start)}</span> {nextProgram.title}
                  </span>
                )}
              </p>
            ) : (
              channel.subtitle && <p className="mt-1 truncate text-mist">{channel.subtitle}</p>
            )}
          </div>
          <p className="hidden font-mono text-xl font-bold tabular md:block">
            {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            type="button"
            onClick={closePlayer}
            aria-label="Fermer le lecteur"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="size-6" />
          </button>
        </div>
      </div>

      {/* Fin d'épisode : enchaînement automatique vers le suivant */}
      {nextEpisode && nextCountdown !== null && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] z-40 w-[min(22rem,calc(100%-3rem))] rounded-2xl bg-ink-950/90 p-5 ring-1 ring-white/10 backdrop-blur-md animate-rise">
          <p className="text-xs font-semibold text-mist">Épisode suivant</p>
          <p className="mt-1 line-clamp-2 font-semibold">{episodeLabel(nextEpisode)}</p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              data-autofocus
              onClick={() => { setNextCountdown(null); playNextEpisode() }}
              className="flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink-950"
            >
              <Play className="size-4" /> Lire ({nextCountdown})
            </button>
            <button type="button" onClick={() => setNextCountdown(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-mist hover:bg-white/10">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Erreur */}
      {fatal && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/85 p-6 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-ink-900 p-8 ring-1 ring-white/8">
            <AlertTriangle className="size-9 text-brand-yellow" />
            <h2 className="mt-5 font-wide text-2xl font-bold">Flux indisponible</h2>
            <p className="mt-3 leading-relaxed text-mist">{fatal}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="primary" data-autofocus icon={<RotateCw className="size-4" />} onClick={() => { setFatal(null); sessionRef.current?.retry() }}>
                Réessayer
              </Button>
              {canZap && (
                <Button icon={<ChevronUp className="size-4" />} onClick={playNextChannel}>
                  Chaîne suivante
                </Button>
              )}
              <Button variant="ghost" onClick={closePlayer}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Commandes */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent pl-[max(var(--gutter),env(safe-area-inset-left))] pr-[max(var(--gutter),env(safe-area-inset-right))] pb-[calc(var(--gutter)+env(safe-area-inset-bottom))] pt-24 transition-opacity duration-300 ${
          showChrome && !fatal ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* Progression */}
        {isLive && nowProgram ? (
          <div className="mb-5 flex items-center gap-4 font-mono text-sm text-mist tabular">
            <span>{formatTime(nowProgram.start)}</span>
            <ProgressLine value={programProgress(nowProgram, now)} className="h-1.5 flex-1" />
            <span>{formatTime(nowProgram.stop)}</span>
          </div>
        ) : !isLive ? (
          <div className="mb-5 flex items-center gap-4 font-mono text-sm tabular">
            <span className="w-16 text-right text-paper">{formatDuration(time.current)}</span>
            <input
              type="range"
              min={0}
              max={time.duration || 0}
              step={10}
              value={time.current}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (videoRef.current) videoRef.current.currentTime = v
                setTime((t) => ({ ...t, current: v }))
              }}
              aria-label="Position de lecture"
              data-seekbar
              className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
              style={{ background: `linear-gradient(to right, #1ec8ff 0%, #ff3ea5 ${progress * 0.7}%, #ff8a1f ${progress}%, rgb(255 255 255 / 0.15) ${progress}%)` }}
            />
            <span className="w-16 text-mist">{formatDuration(time.duration)}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 md:gap-3">
          {canZap && (
            <PlayerButton label="Chaîne précédente" onClick={playPreviousChannel}>
              <ChevronDown className="size-6" />
            </PlayerButton>
          )}
          {!isLive && (
            <PlayerButton label="Reculer de 10 secondes" onClick={() => seekBy(-10)}>
              <RotateCcw className="size-6" />
            </PlayerButton>
          )}
          <button
            type="button"
            data-autofocus
            onClick={togglePlay}
            aria-label={paused ? 'Lecture' : 'Pause'}
            className="btn-brand flex size-14 items-center justify-center rounded-full md:size-16"
          >
            {paused ? <Play className="ml-1 size-7 fill-current" /> : <Pause className="size-7 fill-current" />}
          </button>
          {!isLive && (
            <PlayerButton label="Avancer de 10 secondes" onClick={() => seekBy(10)}>
              <RotateCw className="size-6" />
            </PlayerButton>
          )}
          {canZap && (
            <PlayerButton label="Chaîne suivante" onClick={playNextChannel}>
              <ChevronUp className="size-6" />
            </PlayerButton>
          )}

          <div className="ml-1 hidden items-center gap-2 md:flex">
            <PlayerButton label={muted ? 'Activer le son' : 'Couper le son'} onClick={() => setMuted((v) => !v)}>
              {muted || volume === 0 ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
            </PlayerButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolume(v)
                if (v > 0) setMuted(false)
              }}
              aria-label="Volume"
              data-nav-skip
              className="w-24 accent-[var(--accent)]"
            />
          </div>

          <div className="ml-auto flex items-center gap-1 md:gap-2">
            {canZap && (
              <PlayerButton label="Liste des chaînes" onClick={() => setDrawer(true)}>
                <List className="size-6" />
              </PlayerButton>
            )}
            {(tracks.audio.length > 1 || tracks.subtitles.length > 0) && (
              <div className="relative">
                <PlayerButton label="Audio et sous-titres" onClick={() => setTracksMenu((v) => !v)} active={tracksMenu}>
                  <Languages className="size-6" />
                </PlayerButton>
                {tracksMenu && (
                  <TracksMenu
                    tracks={tracks}
                    onAudio={(id) => sessionRef.current?.setAudioTrack(id)}
                    onSubtitle={(id) => sessionRef.current?.setSubtitleTrack(id)}
                    onClose={() => setTracksMenu(false)}
                  />
                )}
              </div>
            )}
            {channel.qualities && channel.qualities.length > 1 && (
              <div className="relative">
                <PlayerButton label="Qualité" onClick={() => setQualityMenu((v) => !v)} active={qualityMenu}>
                  <Settings2 className="size-6" />
                </PlayerButton>
                {qualityMenu && <QualityMenu channel={channel} onSelect={selectQuality} onClose={() => setQualityMenu(false)} />}
              </div>
            )}
            <PlayerButton
              label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={() => toggleFavorite(channel.vodId ? channel.vodId.split('_ep_')[0] : channel.id)}
            >
              <Heart className={`size-6 ${isFavorite ? 'fill-accent text-accent' : ''}`} />
            </PlayerButton>
            {canZap && (
              <PlayerButton label="Multiview (4 chaînes)" onClick={() => setMultiview(true)} className="hidden sm:flex">
                <Grid2X2 className="size-6" />
              </PlayerButton>
            )}
            {(chromecast || airplay) && (
              <PlayerButton label="Diffuser sur un écran" onClick={() => void startCast()} active={!!castingTo}>
                <Cast className="size-6" />
              </PlayerButton>
            )}
            {document.pictureInPictureEnabled && (
              <PlayerButton label="Incrustation" onClick={togglePip} className="hidden sm:flex">
                <PictureInPicture2 className="size-6" />
              </PlayerButton>
            )}
            {!isNativeApp && (
              <PlayerButton label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize className="size-6" /> : <Maximize className="size-6" />}
              </PlayerButton>
            )}
          </div>
        </div>
      </div>

      {drawer && <ChannelDrawer current={channel} onClose={() => setDrawer(false)} />}
      <DigitOsd digits={digits} label={typedChannel?.name || (digits ? 'Aucune chaîne' : undefined)} />
    </div>
  )
}

const PlayerButton: React.FC<{
  label: string
  onClick: () => void
  active?: boolean
  className?: string
  children: React.ReactNode
}> = ({ label, onClick, active, className = '', children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`flex size-12 items-center justify-center rounded-full transition-colors ${
      active ? 'bg-paper text-ink-950' : 'text-paper hover:bg-white/12'
    } ${className}`}
  >
    {children}
  </button>
)

const TracksMenu: React.FC<{
  tracks: { audio: MediaTrack[]; subtitles: MediaTrack[] }
  onAudio: (id: number) => void
  onSubtitle: (id: number) => void
  onClose: () => void
}> = ({ tracks, onAudio, onSubtitle, onClose }) => {
  useBackHandler(true, onClose)
  useEffect(() => {
    const id = window.setTimeout(() => focusFirstIn(document.querySelector('[data-tracks-menu]') || document), 30)
    return () => window.clearTimeout(id)
  }, [])
  const noSubs = !tracks.subtitles.some((t) => t.active)
  const item = (label: string, active: boolean, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      data-autofocus={active || undefined}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left font-semibold ${active ? 'text-accent' : 'text-paper hover:bg-white/8'}`}
    >
      <span className="truncate">{label}</span>
      {active && <Check className="size-4 shrink-0" />}
    </button>
  )
  return (
    <>
      <button type="button" aria-label="Fermer le menu" data-nav-skip onClick={() => goBack()} className="fixed inset-0 z-[1] cursor-default" />
      <div data-nav-trap data-tracks-menu className="absolute bottom-16 right-0 z-[2] max-h-[60vh] w-72 overflow-y-auto rounded-2xl bg-ink-900/95 p-2 ring-1 ring-white/10 animate-rise">
        {tracks.audio.length > 1 && (
          <>
            <p className="px-3 pb-2 pt-1 font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fog">Audio</p>
            {tracks.audio.map((t) => item(t.label, t.active, () => onAudio(t.id), `a${t.id}`))}
          </>
        )}
        {tracks.subtitles.length > 0 && (
          <>
            <p className="px-3 pb-2 pt-3 font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fog">Sous-titres</p>
            {item('Désactivés', noSubs, () => onSubtitle(-1), 's-off')}
            {tracks.subtitles.map((t) => item(t.label, t.active, () => onSubtitle(t.id), `s${t.id}`))}
          </>
        )}
      </div>
    </>
  )
}

const QualityMenu: React.FC<{ channel: Channel; onSelect: (v: QualityVariant) => void; onClose: () => void }> = ({
  channel,
  onSelect,
  onClose,
}) => {
  useBackHandler(true, onClose)
  useEffect(() => {
    const id = window.setTimeout(() => focusFirstIn(document.querySelector('[data-quality-menu]') || document), 30)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <>
    {/* Toucher ailleurs ferme le menu */}
    <button type="button" aria-label="Fermer le menu" data-nav-skip onClick={() => goBack()} className="fixed inset-0 z-[1] cursor-default" />
    <div data-nav-trap data-quality-menu className="absolute bottom-16 right-0 z-[2] w-48 rounded-2xl bg-ink-900/95 p-2 ring-1 ring-white/10 backdrop-blur-xl animate-rise">
      <p className="px-3 pb-2 pt-1 font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-fog">Qualité</p>
      {channel.qualities!.map((q) => {
        const selected = q.quality === channel.selectedQuality
        return (
          <button
            key={q.streamUrl}
            type="button"
            data-autofocus={selected || undefined}
            onClick={() => onSelect(q)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 font-mono font-bold ${selected ? 'text-accent' : 'text-paper hover:bg-white/8'}`}
          >
            {q.quality}
            {selected && <Check className="size-4" />}
          </button>
        )
      })}
    </div>
    </>
  )
}

export default PlayerScreen
