import type { BackupData } from '../types/iptv'
import { backupService } from './backupService'

export const localSyncService = {
  /**
   * Envoie l'état local complet vers le serveur de synchronisation LAN
   */
  async pushToLocalServer(serverUrl: string, data: BackupData): Promise<boolean> {
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '')
    if (!cleanUrl) return false

    const targetUrl = `${cleanUrl}/api/sync`
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6000)

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      clearTimeout(timeout)
      return response.ok
    } catch (err) {
      console.warn('[Local Sync] Échec de la synchronisation push :', err)
      return false
    }
  },

  /**
   * Récupère l'état distant depuis le serveur LAN au démarrage
   */
  async pullFromLocalServer(serverUrl: string): Promise<BackupData | null> {
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '')
    if (!cleanUrl) return null

    const targetUrl = `${cleanUrl}/api/sync`
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6000)

      const response = await fetch(proxyUrl, {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)
      if (response.ok) {
        const text = await response.text()
        return backupService.parseBackupString(text)
      }
      return null
    } catch (err) {
      console.warn('[Local Sync] Serveur local non joignable (hors ligne ou indisponible) :', err)
      return null
    }
  },
}
