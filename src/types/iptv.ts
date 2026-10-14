export interface EpgProgram {
  channelId: string
  title: string
  description?: string
  start: Date
  stop: Date
  category?: string
  progress?: number // 0-100%
  isCatchupAvailable?: boolean
  catchupUrl?: string
}

export interface EpgChannel {
  id: string
  name: string
  icon?: string
}

export interface QualityVariant {
  quality: '4K' | 'FHD' | 'HD' | 'SD' | 'AUTO'
  streamUrl: string
  tsUrl?: string
  m3u8Url?: string
  originalName: string
}

export interface Channel {
  id: string
  name: string
  cleanName?: string
  logo?: string
  streamUrl: string
  category: string
  epgId?: string

  // Aliases indispensables pour rétrocompatibilité totale
  url: string
  group: string
  tvgId?: string

  // Multi-qualités regroupées intelligemment
  qualities?: QualityVariant[]
  selectedQuality?: string

  // Métadonnées enrichies
  streamId?: number | string
  streamType?: 'live' | 'movie' | 'series'
  tsUrl?: string
  m3u8Url?: string
  tvgName?: string
  country?: string
  language?: string
  catchup?: string
  catchupDays?: number
  timeshift?: string
  raw?: string
  currentProgram?: EpgProgram

  // Numéro de chaîne affiché (ordre de la playlist, à partir de 1)
  number?: number

  // Lecture VOD : identifiant du titre pour le point de reprise, et position de départ
  vodId?: string
  resumeFrom?: number
  subtitle?: string
}

export interface VodItem {
  id: string
  name: string
  cleanTitle: string
  type: 'movie' | 'series'
  streamUrl: string
  streamId: number | string
  category: string
  logo?: string
  containerExtension?: string
  rating?: number
  year?: string
  overview?: string
  backdrop?: string
  tmdbId?: number
  genres?: string[]
  resumeTime?: number // temps en secondes
  duration?: number // durée totale en secondes
  cast?: string
  director?: string
  runtime?: string
  /** Date d'ajout au catalogue du fournisseur (ms), pour « Ajoutés récemment » */
  addedAt?: number
}

export interface SeriesEpisode {
  id: string
  episodeNum: number
  season: number
  title: string
  streamUrl: string
  plot?: string
  duration?: string
  image?: string
}

export interface SeriesSeason {
  season: number
  episodes: SeriesEpisode[]
}

export interface VodResumePoint {
  id: string
  currentTime: number
  duration: number
  updatedAt: number
}

export interface MultiviewSlot {
  id: number
  channel: Channel | null
  isMuted: boolean
}

export interface XtreamCredentials {
  serverUrl: string
  username: string
  password: string
}

export interface StalkerCredentials {
  portalUrl: string
  macAddress: string
  token?: string
}

export interface EnigmaCredentials {
  hostUrl: string
  port?: number
  streamPort?: number
}

export interface XtreamUserInfo {
  username: string
  status: string
  expDate?: string
  isTrial?: string
  activeCons?: string
  maxConnections?: string
  auth?: number
}

export interface XtreamServerInfo {
  url?: string
  port?: string
  serverProtocol?: string
  timezone?: string
}

export interface XtreamCategory {
  category_id: string
  category_name: string
  parent_id?: number
}

export interface XtreamStream {
  num?: number
  name: string
  stream_type?: string
  stream_id: number
  stream_icon?: string
  epg_channel_id?: string
  category_id: string
  tv_archive?: number
  container_extension?: string
  rating?: string | number
  year?: string
}

export interface BackupData {
  version: number
  exportedAt: string
  favorites: string[]
  connectionMode: ConnectionMode
  playlistUrl: string | null
  xtreamCreds: XtreamCredentials | null
  stalkerCreds: StalkerCredentials | null
  enigmaCreds: EnigmaCredentials | null
  epgUrl: string | null
  accentColor: string
  vodResumePoints: Record<string, VodResumePoint>
  localSyncUrl?: string
}

export type ConnectionMode = 'm3u' | 'xtream' | 'stalker' | 'enigma2'

export type CurrentView = 'home' | 'live' | 'favorites' | 'movies' | 'series' | 'epg' | 'search' | 'settings'

export type DeviceMode = 'tv' | 'desktop' | 'mobile'
export type DeviceModePreference = 'auto' | DeviceMode

export type LoadingStatus = 'idle' | 'loading' | 'success' | 'error'

export interface CorsProxyOption {
  id: string
  name: string
  urlPrefix: (targetUrl: string) => string
  description: string
}

export interface DemoPlaylist {
  id: string
  title: string
  description: string
  url: string
  badge: string
  country?: string
}
