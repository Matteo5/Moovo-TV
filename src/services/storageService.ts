import type {
  Channel,
  XtreamCredentials,
  StalkerCredentials,
  EnigmaCredentials,
  ConnectionMode,
  DeviceModePreference,
} from '../types/iptv'
import { normalizeAccent, type AccentColor } from '../types/theme'

const KEYS = {
  CONNECTION_MODE: 'iptv_connection_mode',
  PLAYLIST_URL: 'iptv_current_playlist_url',
  XTREAM_CREDS: 'iptv_xtream_credentials',
  STALKER_CREDS: 'iptv_stalker_credentials',
  ENIGMA_CREDS: 'iptv_enigma_credentials',
  EPG_URL: 'iptv_epg_xmltv_url',
  FAVORITES: 'iptv_favorite_channel_ids',
  RECENT_CHANNELS: 'iptv_recently_watched',
  SAVED_VOLUME: 'iptv_player_volume',
  MUTED: 'iptv_player_muted',
  ACCENT_COLOR: 'iptv_accent_color',
  DEVICE_MODE: 'moovo_device_mode',
  HIDDEN_CATEGORIES: 'moovo_hidden_categories',
  PARENTAL: 'moovo_parental',
}

export const storageService = {
  getConnectionMode(): ConnectionMode {
    try {
      const mode = localStorage.getItem(KEYS.CONNECTION_MODE) as ConnectionMode
      if (['m3u', 'xtream', 'stalker', 'enigma2'].includes(mode)) {
        return mode
      }
      return 'm3u'
    } catch {
      return 'm3u'
    }
  },

  setConnectionMode(mode: ConnectionMode): void {
    try {
      localStorage.setItem(KEYS.CONNECTION_MODE, mode)
    } catch {
      // ignore
    }
  },

  getXtreamCredentials(): XtreamCredentials | null {
    try {
      const data = localStorage.getItem(KEYS.XTREAM_CREDS)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },

  setXtreamCredentials(creds: XtreamCredentials): void {
    try {
      localStorage.setItem(KEYS.XTREAM_CREDS, JSON.stringify(creds))
    } catch {
      // ignore
    }
  },

  clearXtreamCredentials(): void {
    try {
      localStorage.removeItem(KEYS.XTREAM_CREDS)
    } catch {
      // ignore
    }
  },

  getStalkerCredentials(): StalkerCredentials | null {
    try {
      const data = localStorage.getItem(KEYS.STALKER_CREDS)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },

  setStalkerCredentials(creds: StalkerCredentials): void {
    try {
      localStorage.setItem(KEYS.STALKER_CREDS, JSON.stringify(creds))
    } catch {
      // ignore
    }
  },

  clearStalkerCredentials(): void {
    try {
      localStorage.removeItem(KEYS.STALKER_CREDS)
    } catch {
      // ignore
    }
  },

  getEnigmaCredentials(): EnigmaCredentials | null {
    try {
      const data = localStorage.getItem(KEYS.ENIGMA_CREDS)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },

  setEnigmaCredentials(creds: EnigmaCredentials): void {
    try {
      localStorage.setItem(KEYS.ENIGMA_CREDS, JSON.stringify(creds))
    } catch {
      // ignore
    }
  },

  clearEnigmaCredentials(): void {
    try {
      localStorage.removeItem(KEYS.ENIGMA_CREDS)
    } catch {
      // ignore
    }
  },

  getEpgUrl(): string | null {
    try {
      return localStorage.getItem(KEYS.EPG_URL)
    } catch {
      return null
    }
  },

  setEpgUrl(url: string): void {
    try {
      localStorage.setItem(KEYS.EPG_URL, url)
    } catch {
      // ignore
    }
  },

  clearEpgUrl(): void {
    try {
      localStorage.removeItem(KEYS.EPG_URL)
    } catch {
      // ignore
    }
  },

  getPlaylistUrl(): string | null {
    try {
      return localStorage.getItem(KEYS.PLAYLIST_URL)
    } catch {
      return null
    }
  },

  setPlaylistUrl(url: string): void {
    try {
      localStorage.setItem(KEYS.PLAYLIST_URL, url)
    } catch {
      // ignore
    }
  },

  clearPlaylistUrl(): void {
    try {
      localStorage.removeItem(KEYS.PLAYLIST_URL)
    } catch {
      // ignore
    }
  },

  getFavorites(): string[] {
    try {
      const data = localStorage.getItem(KEYS.FAVORITES)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  },

  setFavorites(favorites: string[]): void {
    try {
      localStorage.setItem(KEYS.FAVORITES, JSON.stringify(favorites))
    } catch {
      // ignore
    }
  },

  /** Contrôle parental : code à 4 chiffres et bouquets verrouillés (stockés sur l'appareil uniquement). */
  getParental(): { pin: string; locked: string[]; lockAdultVod: boolean } {
    try {
      const data = localStorage.getItem(KEYS.PARENTAL)
      const parsed = data ? JSON.parse(data) : null
      return {
        pin: typeof parsed?.pin === 'string' ? parsed.pin : '',
        locked: Array.isArray(parsed?.locked) ? parsed.locked : [],
        lockAdultVod: parsed?.lockAdultVod !== false,
      }
    } catch {
      return { pin: '', locked: [], lockAdultVod: true }
    }
  },

  setParental(value: { pin: string; locked: string[]; lockAdultVod: boolean }): void {
    try {
      localStorage.setItem(KEYS.PARENTAL, JSON.stringify(value))
    } catch {
      // ignore
    }
  },

  getHiddenCategories(): string[] {
    try {
      const data = localStorage.getItem(KEYS.HIDDEN_CATEGORIES)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  },

  setHiddenCategories(categories: string[]): void {
    try {
      localStorage.setItem(KEYS.HIDDEN_CATEGORIES, JSON.stringify(categories))
    } catch {
      // ignore
    }
  },

  getRecentChannels(): Channel[] {
    try {
      const data = localStorage.getItem(KEYS.RECENT_CHANNELS)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  },

  addRecentChannel(channel: Channel): void {
    try {
      const recents = this.getRecentChannels().filter((c) => c.id !== channel.id)
      recents.unshift(channel)
      const limited = recents.slice(0, 15)
      localStorage.setItem(KEYS.RECENT_CHANNELS, JSON.stringify(limited))
    } catch {
      // ignore
    }
  },

  getVolume(): number {
    try {
      const vol = localStorage.getItem(KEYS.SAVED_VOLUME)
      return vol !== null ? parseFloat(vol) : 0.8
    } catch {
      return 0.8
    }
  },

  setVolume(volume: number): void {
    try {
      localStorage.setItem(KEYS.SAVED_VOLUME, volume.toString())
    } catch {
      // ignore
    }
  },

  getMuted(): boolean {
    try {
      return localStorage.getItem(KEYS.MUTED) === 'true'
    } catch {
      return false
    }
  },

  setMuted(muted: boolean): void {
    try {
      localStorage.setItem(KEYS.MUTED, muted.toString())
    } catch {
      // ignore
    }
  },

  getAccentColor(): AccentColor {
    try {
      return normalizeAccent(localStorage.getItem(KEYS.ACCENT_COLOR))
    } catch {
      return 'cyan'
    }
  },

  getDeviceModePreference(): DeviceModePreference {
    try {
      const v = localStorage.getItem(KEYS.DEVICE_MODE)
      return v === 'tv' || v === 'desktop' || v === 'mobile' ? v : 'auto'
    } catch {
      return 'auto'
    }
  },

  setDeviceModePreference(mode: DeviceModePreference): void {
    try {
      localStorage.setItem(KEYS.DEVICE_MODE, mode)
    } catch {
      // ignore
    }
  },

  setAccentColor(color: AccentColor): void {
    try {
      localStorage.setItem(KEYS.ACCENT_COLOR, color)
    } catch {
      // ignore
    }
  },

  clearAllData(): void {
    try {
      localStorage.clear()
    } catch {
      // ignore
    }
  },
}
