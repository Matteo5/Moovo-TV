import type { ConnectionMode, EnigmaCredentials, StalkerCredentials, XtreamCredentials } from '../types/iptv'

/**
 * Playlists enregistrées : chaque source qui s'est connectée une fois (Xtream, M3U, portail MAG, Enigma2)
 * reste dans la liste, avec un nom et un code facultatif, pour passer de l'une à l'autre sans retaper les accès.
 * Les fichiers M3U importés n'y figurent pas : un seul fichier est conservé sur l'appareil.
 * Tout reste dans le stockage local de l'appareil.
 */
export interface SavedPlaylist {
  id: string
  name: string
  mode: ConnectionMode
  playlistUrl?: string
  xtream?: XtreamCredentials
  stalker?: StalkerCredentials
  enigma?: EnigmaCredentials
  epgUrl?: string
  /** Code à 4 chiffres demandé avant d'ouvrir la playlist (vide = libre) */
  pin?: string
  lastUsed: number
}

/** Accès d'une source, sans nom ni code. */
export type PlaylistSource = Pick<SavedPlaylist, 'mode' | 'playlistUrl' | 'xtream' | 'stalker' | 'enigma' | 'epgUrl'>

const KEYS = {
  LIST: 'moovo_playlists',
  ACTIVE: 'moovo_active_playlist',
  ASK: 'moovo_playlist_ask_at_startup',
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Même abonnement = même serveur et même identifiant (le mot de passe peut changer). */
function sourceKey(source: PlaylistSource): string {
  switch (source.mode) {
    case 'xtream':
      return `xtream|${source.xtream?.serverUrl.replace(/\/+$/, '').toLowerCase()}|${source.xtream?.username}`
    case 'stalker':
      return `stalker|${source.stalker?.portalUrl.toLowerCase()}|${source.stalker?.macAddress.toUpperCase()}`
    case 'enigma2':
      return `enigma2|${source.enigma?.hostUrl.toLowerCase()}`
    default:
      return `m3u|${source.playlistUrl}`
  }
}

export function defaultPlaylistName(source: PlaylistSource): string {
  if (source.mode === 'xtream' && source.xtream) return `${hostOf(source.xtream.serverUrl)} · ${source.xtream.username}`
  if (source.mode === 'stalker' && source.stalker) return `Portail ${hostOf(source.stalker.portalUrl)}`
  if (source.mode === 'enigma2' && source.enigma) return `Décodeur ${hostOf(source.enigma.hostUrl)}`
  return source.playlistUrl ? hostOf(source.playlistUrl) : 'Playlist'
}

function read<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key)
    return data ? (JSON.parse(data) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota dépassé : la liste ne sera pas mémorisée cette fois.
  }
}

export const playlistsService = {
  getAll(): SavedPlaylist[] {
    const list = read<SavedPlaylist[]>(KEYS.LIST, [])
    return Array.isArray(list) ? list : []
  },

  saveAll(list: SavedPlaylist[]): void {
    write(KEYS.LIST, list)
  },

  getActiveId(): string | null {
    return read<string | null>(KEYS.ACTIVE, null)
  },

  setActiveId(id: string | null): void {
    if (id) write(KEYS.ACTIVE, id)
    else {
      try {
        localStorage.removeItem(KEYS.ACTIVE)
      } catch {
        // ignore
      }
    }
  },

  /** Choix de la playlist à chaque démarrage (dès qu'il y en a plusieurs). Activé par défaut. */
  getAskAtStartup(): boolean {
    return read<boolean>(KEYS.ASK, true) !== false
  },

  setAskAtStartup(ask: boolean): void {
    write(KEYS.ASK, ask)
  },

  /**
   * Ajoute la source à la liste, ou met à jour l'entrée existante du même abonnement.
   * Renvoie la liste à jour et l'identifiant de l'entrée.
   */
  upsert(list: SavedPlaylist[], source: PlaylistSource, name?: string): { list: SavedPlaylist[]; id: string } {
    const key = sourceKey(source)
    const existing = list.find((p) => sourceKey(p) === key)
    if (existing) {
      const updated: SavedPlaylist = {
        ...existing,
        ...source,
        // Reconnexion sans guide : on garde celui déjà choisi
        epgUrl: source.epgUrl || existing.epgUrl,
        name: name?.trim() || existing.name,
        lastUsed: Date.now(),
      }
      return { list: list.map((p) => (p.id === existing.id ? updated : p)), id: existing.id }
    }
    const id = `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const created: SavedPlaylist = { id, name: name?.trim() || defaultPlaylistName(source), ...source, lastUsed: Date.now() }
    return { list: [...list, created], id }
  },
}
