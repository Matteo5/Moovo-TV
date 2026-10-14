import type { BackupData, VodResumePoint } from '../types/iptv'

export const backupService = {
  /**
   * Crée un objet de sauvegarde standardisé
   */
  createBackupPayload(data: {
    favorites: string[]
    connectionMode: any
    playlistUrl: string | null
    xtreamCreds: any
    stalkerCreds: any
    enigmaCreds: any
    epgUrl: string | null
    accentColor: string
    vodResumePoints?: Record<string, VodResumePoint>
    localSyncUrl?: string
  }): BackupData {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      favorites: data.favorites || [],
      connectionMode: data.connectionMode || 'm3u',
      playlistUrl: data.playlistUrl || null,
      xtreamCreds: data.xtreamCreds || null,
      stalkerCreds: data.stalkerCreds || null,
      enigmaCreds: data.enigmaCreds || null,
      epgUrl: data.epgUrl || null,
      accentColor: data.accentColor || 'red',
      vodResumePoints: data.vodResumePoints || {},
      localSyncUrl: data.localSyncUrl || '',
    }
  },

  /**
   * Télécharge un fichier JSON de sauvegarde sur le PC / l'appareil
   */
  exportToFile(payload: BackupData): void {
    const jsonStr = JSON.stringify(payload, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `iptv_backup_${dateStr}.json`

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  },

  /**
   * Valide et analyse une chaîne JSON importée
   */
  parseBackupString(jsonString: string): BackupData {
    let parsed: any
    try {
      parsed = JSON.parse(jsonString)
    } catch {
      throw new Error('Le fichier sélectionné n\'est pas un JSON valide.')
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Format de sauvegarde invalide.')
    }

    // Validation des champs vitaux
    return {
      version: parsed.version || 1,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      connectionMode: ['m3u', 'xtream', 'stalker', 'enigma2'].includes(parsed.connectionMode)
        ? parsed.connectionMode
        : 'm3u',
      playlistUrl: parsed.playlistUrl || null,
      xtreamCreds: parsed.xtreamCreds || null,
      stalkerCreds: parsed.stalkerCreds || null,
      enigmaCreds: parsed.enigmaCreds || null,
      epgUrl: parsed.epgUrl || null,
      accentColor: parsed.accentColor || 'red',
      vodResumePoints: parsed.vodResumePoints && typeof parsed.vodResumePoints === 'object'
        ? parsed.vodResumePoints
        : {},
      localSyncUrl: parsed.localSyncUrl || '',
    }
  },

  /**
   * Fusionne intelligemment deux sauvegardes en résolvant les conflits :
   * - Favoris : Déduplication basée sur l'ID
   * - Reprise VOD : Conserve toujours le point de modification le plus récent (timestamp)
   */
  mergeData(local: BackupData, remote: Partial<BackupData>): BackupData {
    // 1. Fusion des favoris sans doublon
    const mergedFavoritesSet = new Set<string>([
      ...(local.favorites || []),
      ...(remote.favorites || []),
    ])
    const mergedFavorites = Array.from(mergedFavoritesSet)

    // 2. Fusion des reprises de lecture VOD par timestamp le plus récent
    const mergedResumePoints: Record<string, VodResumePoint> = {
      ...(local.vodResumePoints || {}),
    }

    if (remote.vodResumePoints) {
      for (const [id, remotePoint] of Object.entries(remote.vodResumePoints)) {
        const localPoint = mergedResumePoints[id]
        if (!localPoint) {
          mergedResumePoints[id] = remotePoint
        } else {
          // Conserver le timestamp le plus récent
          if ((remotePoint.updatedAt || 0) >= (localPoint.updatedAt || 0)) {
            mergedResumePoints[id] = remotePoint
          }
        }
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      favorites: mergedFavorites,
      connectionMode: remote.connectionMode || local.connectionMode,
      playlistUrl: remote.playlistUrl || local.playlistUrl,
      xtreamCreds: remote.xtreamCreds || local.xtreamCreds,
      stalkerCreds: remote.stalkerCreds || local.stalkerCreds,
      enigmaCreds: remote.enigmaCreds || local.enigmaCreds,
      epgUrl: remote.epgUrl || local.epgUrl,
      accentColor: remote.accentColor || local.accentColor,
      vodResumePoints: mergedResumePoints,
      localSyncUrl: remote.localSyncUrl || local.localSyncUrl,
    }
  },
}
