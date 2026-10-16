import { Capacitor, registerPlugin } from '@capacitor/core'
import { handleBack, installBackListeners } from './hooks/useBackHandler'

/**
 * Intégration de l'application native (Capacitor : Android / Android TV, iPhone / iPad).
 * Dans un navigateur, tout ceci est sans effet.
 */
export const isNativeApp = Capacitor.isNativePlatform()
export const nativePlatform = Capacitor.getPlatform() // 'android' | 'ios' | 'web'
/** Lecteurs vidéo externes (VLC, Nova…) : application Android uniquement. */
export const hasExternalPlayers = nativePlatform === 'android'

interface MoovoNativePlugin {
  getDeviceInfo(): Promise<{ television: boolean }>
  getInstalledPlayers(): Promise<{ packages: string[] }>
  openExternal(options: { url: string; package?: string; title?: string }): Promise<void>
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
