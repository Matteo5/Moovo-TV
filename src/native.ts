import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { handleBack, installBackListeners } from './hooks/useBackHandler'

/**
 * Intégration de l'application native (Capacitor : Android / Android TV, iPhone / iPad).
 * Dans un navigateur, tout ceci est sans effet.
 */
export const isNativeApp = Capacitor.isNativePlatform()
export const nativePlatform = Capacitor.getPlatform() // 'android' | 'ios' | 'web'
/** Lecteurs vidéo externes : VLC, Nova… sur Android, VLC ou Infuse sur iPhone. */
export const hasExternalPlayers = nativePlatform === 'android' || nativePlatform === 'ios'

/**
 * iPhone : le lecteur intégré ne lit que MP4 / MOV, HLS et MPEG-TS.
 * Les autres conteneurs (.mkv, .avi…), très courants chez les fournisseurs Xtream, partent vers VLC.
 */
const IOS_PLAYABLE = /\.(mp4|m4v|mov|m3u8|ts)$/i
export function needsExternalPlayerOnIos(url: string): boolean {
  if (nativePlatform !== 'ios') return false
  try {
    return !IOS_PLAYABLE.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/**
 * iPhone : lit un film ou un épisode dans le lecteur VLC intégré à l'application (tous formats).
 * Renvoie la position atteinte à la fermeture, ou null si le lecteur natif est absent (ancienne version de l'appli).
 * nextTitle : épisode suivant proposé en fin de lecture ; next vaut true s'il faut l'enchaîner.
 */
export async function playInNativePlayer(
  url: string,
  title: string,
  startAt: number,
  nextTitle?: string
): Promise<{ position: number; duration: number; next?: boolean } | null> {
  if (nativePlatform !== 'ios') return null
  try {
    return await MoovoNative.playVideo({ url, title, startAt, nextTitle })
  } catch {
    return null
  }
}

function iosPlayerUrl(url: string, player: string): string {
  if (player === 'ios-infuse') return `infuse://x-callback-url/play?url=${encodeURIComponent(url)}`
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`
}

export interface NativeVideoEvent {
  type: 'state' | 'firstFrame' | 'tracks' | 'ended' | 'error'
  time?: number
  /** -1 : direct ou durée inconnue */
  duration?: number
  buffered?: number
  playing?: boolean
  paused?: boolean
  buffering?: boolean
  ended?: boolean
  code?: string
  message?: string
  /** L'erreur survient après le début de la lecture */
  played?: boolean
}

export interface NativeTrack {
  id: number
  label: string
  lang: string
  active: boolean
}

interface MoovoNativePlugin {
  getDeviceInfo(): Promise<{ television: boolean; nativeVideo?: boolean; versionName?: string; versionCode?: number; model?: string; sdk?: number }>
  getInstalledPlayers(): Promise<{ packages: string[] }>
  openExternal(options: { url: string; package?: string; title?: string }): Promise<void>
  /** iPhone : lecteur VLC intégré, résout à sa fermeture. */
  playVideo(options: { url: string; title?: string; startAt?: number; nextTitle?: string }): Promise<{ position: number; duration: number; next?: boolean }>
  /** Android : lecteur ExoPlayer sous la WebView (voir player/nativeVideo.ts). */
  videoLoad(options: {
    url: string
    fallbackUrl?: string
    live: boolean
    startAt?: number
    mac?: string
    token?: string
    audioLang?: string
    subtitleLang?: string
  }): Promise<void>
  videoPlay(): Promise<void>
  videoPause(): Promise<void>
  videoSeek(options: { time: number }): Promise<void>
  videoVolume(options: { volume: number; muted: boolean }): Promise<void>
  videoResize(options: { mode: 'fit' | 'fill' | 'stretch' }): Promise<void>
  videoSelectTrack(options: { kind: 'audio' | 'text'; id: number }): Promise<void>
  videoTracks(): Promise<{ audio?: NativeTrack[]; subtitles?: NativeTrack[] }>
  videoStop(): Promise<void>
  addListener(event: 'videoEvent', listener: (event: NativeVideoEvent) => void): Promise<PluginListenerHandle>
  /** Android : télécharge l'APK de la nouvelle version puis ouvre l'installateur (rejet NEED_PERMISSION possible). */
  installUpdate(options: { url: string }): Promise<void>
  addListener(event: 'updateProgress', listener: (event: { received: number; total: number }) => void): Promise<PluginListenerHandle>
}
export const MoovoNative = registerPlugin<MoovoNativePlugin>('MoovoNative')

let television = false
export function isNativeTelevision(): boolean {
  return television
}

function showToast(message: string) {
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  el.className =
    'fixed bottom-10 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-paper px-6 py-3 text-base font-semibold text-ink-950 shadow-2xl animate-rise'
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 2200)
}

export async function setupNative(): Promise<void> {
  if (!isNativeApp) return

  if (nativePlatform === 'android') {
    try {
      television = (await MoovoNative.getDeviceInfo()).television
    } catch {
      television = false
    }
  }

  const { App } = await import('@capacitor/app')
  installBackListeners()

  // Bouton Retour Android / télécommande : calques, puis accueil, puis double appui pour quitter
  let exitArmedUntil = 0
  await App.addListener('backButton', () => {
    if (handleBack() === 'handled') return
    if (Date.now() < exitArmedUntil) {
      void App.exitApp()
      return
    }
    exitArmedUntil = Date.now() + 2000
    showToast('Appuyez de nouveau sur Retour pour quitter')
  })
}

/** Lecteurs vidéo externes installés (VLC, Nova…) ; vide hors application Android. */
export async function getInstalledPlayers(): Promise<string[]> {
  if (nativePlatform !== 'android') return []
  try {
    return (await MoovoNative.getInstalledPlayers()).packages
  } catch {
    return []
  }
}

/**
 * Ouvre une vidéo dans un lecteur externe. « ask » affiche le choix d'application d'Android.
 * Renvoie false si le lecteur demandé n'est pas disponible (on lit alors avec le lecteur intégré).
 */
export async function openInExternalPlayer(url: string, player: string, title: string): Promise<boolean> {
  if (nativePlatform === 'ios') {
    // Capacitor confie les schémas inconnus à iOS, qui ouvre l'application correspondante
    const name = player === 'ios-infuse' ? 'Infuse' : 'VLC'
    showToast(`Ouverture dans ${name}… (à installer depuis l’App Store si rien ne s’ouvre)`)
    window.location.href = iosPlayerUrl(url, player)
    return true
  }
  if (nativePlatform !== 'android') return false
  try {
    await MoovoNative.openExternal({ url, title, package: player === 'ask' ? '' : player })
    return true
  } catch {
    if (player === 'ask') return false
    try {
      await MoovoNative.openExternal({ url, title, package: '' })
      return true
    } catch {
      return false
    }
  }
}
