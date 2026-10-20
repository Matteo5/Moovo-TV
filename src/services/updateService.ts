import { MoovoNative, nativePlatform } from '../native'

/**
 * Mises à jour de l'application Android (téléphone, Android TV, Fire TV) installée hors Play Store.
 * android/update.json, publié dans le dépôt GitHub, décrit la dernière version et le lien de son APK
 * (Google Drive). Au démarrage, l'application compare avec sa propre version et propose l'installation.
 */
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Matteo5/Moovo-TV/main/android/update.json'

export interface AvailableUpdate {
  versionCode: number
  versionName: string
  apkUrl: string
  notes?: string
  currentVersionName?: string
}

interface UpdateManifest {
  versionCode?: number
  versionName?: string
  apkUrl?: string
  notes?: string
}

/** Lien de partage Google Drive (…/file/d/ID/view) → téléchargement direct, sans page d'avertissement. */
export function directDownloadUrl(url: string): string {
  const id = /\/file\/d\/([\w-]+)/.exec(url)?.[1] || /[?&]id=([\w-]+)/.exec(url)?.[1]
  if (id && /drive\.google\.com|drive\.usercontent\.google\.com/.test(url)) {
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
  }
  return url
}

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (nativePlatform !== 'android') return null
  try {
    const [info, response] = await Promise.all([
      MoovoNative.getDeviceInfo(),
      // moovo_update_manifest_url : autre manifeste, pour tester une mise à jour sans la publier
      fetch(`${localStorage.getItem('moovo_update_manifest_url') || UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' }),
    ])
    if (!response.ok || !info.versionCode) return null
    const manifest = (await response.json()) as UpdateManifest
    if (!manifest.versionCode || !manifest.apkUrl || manifest.versionCode <= info.versionCode) return null
    return {
      versionCode: manifest.versionCode,
      versionName: manifest.versionName || String(manifest.versionCode),
      apkUrl: directDownloadUrl(manifest.apkUrl),
      notes: manifest.notes,
      currentVersionName: info.versionName,
    }
  } catch {
    // Hors ligne ou GitHub injoignable : on réessaiera au prochain démarrage
    return null
  }
}

/** Télécharge l'APK et ouvre l'installateur d'Android. onProgress : 0 à 1 (ou -1 si taille inconnue). */
export async function installUpdate(update: AvailableUpdate, onProgress: (ratio: number) => void): Promise<void> {
  const handle = await MoovoNative.addListener('updateProgress', (e) => onProgress(e.total > 0 ? e.received / e.total : -1))
  try {
    await MoovoNative.installUpdate({ url: update.apkUrl })
  } finally {
    void handle.remove()
  }
}
