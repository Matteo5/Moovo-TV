import { Capacitor, registerPlugin } from '@capacitor/core'
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
 */
export async function playInNativePlayer(
  url: string,
  title: string,
  startAt: number
): Promise<{ position: number; duration: number } | null> {
  if (nativePlatform !== 'ios') return null
  try {
    return await MoovoNative.playVideo({ url, title, startAt })
  } catch {
    return null
  }
}

function iosPlayerUrl(url: string, player: string): string {
  if (player === 'ios-infuse') return `infuse://x-callback-url/play?url=${encodeURIComponent(url)}`
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`
}

interface MoovoNativePlugin {
  getDeviceInfo(): Promise<{ television: boolean }>
  getInstalledPlayers(): Promise<{ packages: string[] }>
  openExternal(options: { url: string; package?: string; title?: string }): Promise<void>
  /** iPhone : lecteur VLC intégré, résout à sa fermeture. */
  playVideo(options: { url: string; title?: string; startAt?: number }): Promise<{ position: number; duration: number }>
}
const MoovoNative = registerPlugin<MoovoNativePlugin>('MoovoNative')

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
