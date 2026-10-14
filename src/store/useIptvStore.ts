import { create } from 'zustand'
import type {
  Channel,
  LoadingStatus,
  XtreamCredentials,
  XtreamUserInfo,
  StalkerCredentials,
  EnigmaCredentials,
  ConnectionMode,
  CurrentView,
  VodItem,
  VodResumePoint,
  SeriesEpisode,
  DeviceModePreference,
  BackupData,
} from '../types/iptv'
import { applyAccent, normalizeAccent, type AccentColor } from '../types/theme'
import { m3uService } from '../services/m3uService'
import { xtreamService } from '../services/xtreamService'
import { stalkerService } from '../services/stalkerService'
import { enigmaService } from '../services/enigmaService'
import { epgService } from '../services/epgService'
import { storageService } from '../services/storageService'
import { groupChannelsByQuality } from '../services/channelGroupingService'
import { channelCategory, filterBySelection, isAdultCategory } from '../services/categoryService'
import { backupService } from '../services/backupService'
import { localSyncService } from '../services/localSyncService'
import { cleanMediaTitle } from '../services/tmdbService'
import { fileStore } from '../services/fileStore'
import { getPlaybackPrefs } from '../services/playbackPrefs'
import { isNativeApp, openInExternalPlayer } from '../native'

const LOCAL_FILE_PREFIX = 'file:'
const RESUME_KEY = 'iptv_vod_resume_points'
const SYNC_URL_KEY = 'iptv_local_sync_url'

interface IptvState {
  connectionMode: ConnectionMode
  playlistUrl: string | null
  xtreamCreds: XtreamCredentials | null
  xtreamUserInfo: XtreamUserInfo | null
  stalkerCreds: StalkerCredentials | null
  stalkerToken: string | null
  enigmaCreds: EnigmaCredentials | null
  epgUrl: string | null
  epgStatus: LoadingStatus
  epgVersion: number
  /** Chaînes visibles (catégories masquées exclues), numérotées sur la playlist complète. */
  channels: Channel[]
  /** Toutes les chaînes du direct, y compris celles des catégories masquées. */
  allChannels: Channel[]
  vodMovies: VodItem[]
  vodSeries: VodItem[]
  vodResumePoints: Record<string, VodResumePoint>
  localSyncUrl: string
  /** Catégories visibles, dans l'ordre du fournisseur. */
  categories: string[]
  /** Toutes les catégories, masquées comprises (réglages). */
  allCategories: string[]
  categoryCounts: Record<string, number>
  hiddenCategories: string[]
  /** Contrôle parental : code (vide = désactivé), bouquets verrouillés, films/séries adultes verrouillés */
  parentalPin: string
  lockedCategories: string[]
  lockAdultVod: boolean
  /** Déverrouillé jusqu'à la fermeture de l'application */
  parentalUnlocked: boolean
  /** Contenu qui attend le code avant de s'ouvrir */
  pendingUnlock: { kind: 'channel'; channel: Channel } | { kind: 'vod'; item: VodItem } | null
  favorites: string[]
  status: LoadingStatus
  errorMessage: string | null
  parsingProgress: number | null
  selectedCategory: string
  searchQuery: string
  activeChannel: Channel | null
  recentlyWatched: Channel[]
  preferredProxy: string
  currentView: CurrentView
  accentColor: AccentColor
  deviceModePreference: DeviceModePreference
  vodDetail: VodItem | null

  // Actions
  initialize: () => Promise<void>
  setCurrentView: (view: CurrentView) => void
  setAccentColor: (color: AccentColor) => void
  setDeviceModePreference: (mode: DeviceModePreference) => void
  setConnectionMode: (mode: ConnectionMode) => void
  setLocalSyncUrl: (url: string) => void
  loadPlaylist: (url: string, epgUrl?: string) => Promise<void>
  loadXtream: (creds: XtreamCredentials, epgUrl?: string) => Promise<void>
  loadStalker: (creds: StalkerCredentials, epgUrl?: string) => Promise<void>
  loadEnigma: (creds: EnigmaCredentials, epgUrl?: string) => Promise<void>
  loadFromLocalFile: (content: string, fileName?: string, epgUrl?: string) => Promise<void>
  reloadSource: () => Promise<void>
  loadEpg: (epgUrl: string) => Promise<void>
  loadProviderEpg: () => Promise<void>
  refreshNowPlaying: () => void
  toggleFavorite: (id: string) => void
  saveResumePoint: (id: string, currentTime: number, duration: number) => void
  clearResumePoint: (id: string) => void
  exportBackup: () => void
  importBackup: (jsonStr: string) => boolean
  selectCategory: (category: string) => void
  setCategoriesHidden: (categories: string[], hidden: boolean) => void
  setParentalPin: (pin: string) => void
  setCategoriesLocked: (categories: string[], locked: boolean) => void
  setLockAdultVod: (locked: boolean) => void
  submitParentalPin: (pin: string) => boolean
  cancelUnlock: () => void
  isChannelLocked: (channel: Channel) => boolean
  isVodLocked: (item: VodItem) => boolean
  setSearchQuery: (query: string) => void
  setActiveChannel: (channel: Channel | null) => void
  playVod: (item: VodItem, options?: { episode?: SeriesEpisode; fromStart?: boolean; forceInternal?: boolean }) => void
  playChannelNumber: (num: number) => boolean
  playNextChannel: () => void
  playPreviousChannel: () => void
  openVodDetail: (item: VodItem) => void
  closeVodDetail: () => void
  resetPlaylist: () => void
  clearCacheAndReload: () => void
  setPreferredProxy: (proxyId: string) => void
}

// Les playlists M3U mélangent souvent direct, films et séries. Le nom de catégorie ne suffit pas
// (« Movies » désigne souvent des chaînes ciné en direct) : seul un fichier vidéo est un titre VOD.
function splitM3uContent(grouped: Channel[]) {
  const live: Channel[] = []
  const movies: VodItem[] = []
  const series: VodItem[] = []

  for (const ch of grouped) {
    const url = ch.streamUrl
    const isVodFile = /\.(mp4|mkv|avi|mov|webm|m4v)(\?|$)/i.test(url) || /\/(movie|series)\//i.test(url)
    const cat = (ch.category || ch.group || '').toUpperCase()
    const isSeries = isVodFile && (/\/series\//i.test(url) || /SERIE|SÉRIE|SEASON|SAISON|EPISODE|\bS\d{1,2}\s?E\d{1,2}\b/.test(cat + ' ' + ch.name.toUpperCase()))
    const isMovie = isVodFile && !isSeries

    if (isSeries || isMovie) {
      const { title: cleanTitle, year } = cleanMediaTitle(ch.name)
      const item: VodItem = {
        id: `m3u_${isSeries ? 's' : 'm'}_${ch.id}`,
        name: ch.name,
        cleanTitle,
        type: isSeries ? 'series' : 'movie',
        streamUrl: ch.streamUrl,
        streamId: ch.id,
        category: ch.category || (isSeries ? 'Séries' : 'Films'),
        logo: ch.logo,
        year,
      }
      ;(isSeries ? series : movies).push(item)
    } else {
      live.push(ch)
    }
  }

  return { live: live.length > 0 ? live : grouped, movies, series }
}

// Zapping dans la catégorie sélectionnée (ou les favoris), comme sur un décodeur ;
// si la chaîne en cours n'en fait pas partie, on parcourt toute la liste
function stepChannel(
  state: Pick<IptvState, 'activeChannel' | 'channels' | 'selectedCategory' | 'favorites' | 'isChannelLocked'>,
  delta: 1 | -1
): Channel | null {
  const { activeChannel, selectedCategory, favorites } = state
  // Le zapping saute les chaînes verrouillées par le contrôle parental (le code reste demandé à l'appel direct)
  const channels = state.channels.filter((c) => c.id === activeChannel?.id || !state.isChannelLocked(c))
  if (!activeChannel || channels.length === 0) return null
  if (activeChannel.streamType === 'movie' || activeChannel.streamType === 'series') return null

  let list = filterBySelection(channels, selectedCategory, favorites)
  if (!list.some((c) => c.id === activeChannel.id)) list = channels

  const index = list.findIndex((c) => c.id === activeChannel.id)
  return list[(index + delta + list.length) % list.length] ?? null
}

function numberChannels(list: Channel[]): Channel[] {
  return list.map((ch, i) => ({ ...ch, number: i + 1 }))
}

function computeCategories(list: Channel[]) {
  const counts: Record<string, number> = {}
  for (const ch of list) {
    const grp = channelCategory(ch)
    counts[grp] = (counts[grp] || 0) + 1
  }
  // Ordre d'apparition dans la playlist : c'est celui que le fournisseur a choisi
  const categories = Object.keys(counts)
  return { categories, counts }
}

function readResumePoints(): Record<string, VodResumePoint> {
  try {
    const rp = localStorage.getItem(RESUME_KEY)
    return rp ? JSON.parse(rp) : {}
  } catch {
    return {}
  }
}

function writeResumePoints(points: Record<string, VodResumePoint>) {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify(points))
  } catch {
    // Quota dépassé : la reprise ne sera pas mémorisée cette fois.
  }
}

const initialParental = storageService.getParental()

export const useIptvStore = create<IptvState>((set, get) => {
  const saveParental = () => {
    const { parentalPin, lockedCategories, lockAdultVod } = get()
    storageService.setParental({ pin: parentalPin, locked: lockedCategories, lockAdultVod })
  }

  const buildPayload = (overrides: Partial<BackupData> = {}): BackupData => {
    const s = get()
    return backupService.createBackupPayload({
      favorites: s.favorites,
      connectionMode: s.connectionMode,
      playlistUrl: s.playlistUrl,
      xtreamCreds: s.xtreamCreds,
      stalkerCreds: s.stalkerCreds,
      enigmaCreds: s.enigmaCreds,
      epgUrl: s.epgUrl,
      accentColor: s.accentColor,
      vodResumePoints: s.vodResumePoints,
      localSyncUrl: s.localSyncUrl,
      ...overrides,
    })
  }

  // Synchronisation LAN en arrière-plan, regroupée pour éviter une requête par seconde de lecture
  let syncTimer: number | undefined
  const scheduleSync = () => {
    const url = get().localSyncUrl
    if (!url) return
    window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => {
      localSyncService.pushToLocalServer(url, buildPayload()).catch(() => {})
    }, 4000)
  }

  // Les chaînes des catégories masquées disparaissent de toute l'application (direct, guide, zapping, numéros)
  const visibleChannels = (all: Channel[], hidden: string[]) => {
    if (hidden.length === 0) return all
    const set = new Set(hidden)
    return all.filter((c) => !set.has(channelCategory(c)))
  }

  const applyLiveChannels = (live: Channel[], extra: Partial<IptvState> = {}) => {
    const numbered = numberChannels(epgService.hasData() ? epgService.enrichChannelsWithEpg(live) : live)
    const { categories, counts } = computeCategories(numbered)
    const hidden = get().hiddenCategories
    set({
      channels: visibleChannels(numbered, hidden),
      allChannels: numbered,
      categories: categories.filter((c) => !hidden.includes(c)),
      allCategories: categories,
      categoryCounts: counts,
      status: 'success',
      errorMessage: null,
      parsingProgress: null,
      selectedCategory: 'ALL',
      searchQuery: '',
      ...extra,
    })
  }

  const enrichAll = (state: IptvState) => {
    const all = epgService.enrichChannelsWithEpg(state.allChannels)
    return { allChannels: all, channels: visibleChannels(all, state.hiddenCategories) }
  }

  const startEpg = (epgUrl?: string) => {
    if (epgUrl && epgUrl.trim()) get().loadEpg(epgUrl.trim())
  }

  const failWith = (err: unknown, fallback: string) => {
    set({
      status: 'error',
      errorMessage: err instanceof Error ? err.message : fallback,
      parsingProgress: null,
    })
  }

  return {
    connectionMode: storageService.getConnectionMode(),
    playlistUrl: null,
    xtreamCreds: storageService.getXtreamCredentials(),
    xtreamUserInfo: null,
    stalkerCreds: storageService.getStalkerCredentials(),
    stalkerToken: null,
    enigmaCreds: storageService.getEnigmaCredentials(),
    epgUrl: storageService.getEpgUrl(),
    epgStatus: 'idle',
    epgVersion: 0,
    channels: [],
    allChannels: [],
    vodMovies: [],
    vodSeries: [],
    vodResumePoints: {},
    localSyncUrl: '',
    categories: [],
    allCategories: [],
    categoryCounts: {},
    hiddenCategories: storageService.getHiddenCategories(),
    parentalPin: initialParental.pin,
    lockedCategories: initialParental.locked,
    lockAdultVod: initialParental.lockAdultVod,
    parentalUnlocked: false,
    pendingUnlock: null,
    favorites: storageService.getFavorites(),
    status: 'idle',
    errorMessage: null,
    parsingProgress: null,
    selectedCategory: 'ALL',
    searchQuery: '',
    activeChannel: null,
    recentlyWatched: storageService.getRecentChannels(),
    preferredProxy: 'auto',
    currentView: 'home',
    accentColor: storageService.getAccentColor(),
    deviceModePreference: storageService.getDeviceModePreference(),
    vodDetail: null,

    initialize: async () => {
      const savedMode = storageService.getConnectionMode()
      const savedXtream = storageService.getXtreamCredentials()
      const savedStalker = storageService.getStalkerCredentials()
      const savedEnigma = storageService.getEnigmaCredentials()
      const savedEpg = storageService.getEpgUrl()
      const savedUrl = storageService.getPlaylistUrl()
      const savedAccent = storageService.getAccentColor()
      const savedSyncUrl = localStorage.getItem(SYNC_URL_KEY) || ''

      applyAccent(savedAccent)

      set({
        connectionMode: savedMode,
        favorites: storageService.getFavorites(),
        recentlyWatched: storageService.getRecentChannels(),
        xtreamCreds: savedXtream,
        stalkerCreds: savedStalker,
        enigmaCreds: savedEnigma,
        epgUrl: savedEpg,
        accentColor: savedAccent,
        vodResumePoints: readResumePoints(),
        localSyncUrl: savedSyncUrl,
      })

      // Synchronisation LAN : fusion de l'état distant avant de charger la source
      if (savedSyncUrl) {
        try {
          const remoteData = await localSyncService.pullFromLocalServer(savedSyncUrl)
          if (remoteData) {
            const merged = backupService.mergeData(buildPayload(), remoteData)
            set({ favorites: merged.favorites, vodResumePoints: merged.vodResumePoints })
            storageService.setFavorites(merged.favorites)
            writeResumePoints(merged.vodResumePoints)
          }
        } catch (err) {
          console.warn('[Sync] Récupération initiale ignorée :', err)
        }
      }

      try {
        if (savedMode === 'xtream' && savedXtream) {
          await get().loadXtream(savedXtream, savedEpg || undefined)
        } else if (savedMode === 'stalker' && savedStalker) {
          await get().loadStalker(savedStalker, savedEpg || undefined)
        } else if (savedMode === 'enigma2' && savedEnigma) {
          await get().loadEnigma(savedEnigma, savedEpg || undefined)
        } else if (savedUrl?.startsWith(LOCAL_FILE_PREFIX)) {
          const stored = await fileStore.loadPlaylist()
          if (stored) await get().loadFromLocalFile(stored.content, stored.name, savedEpg || undefined)
        } else if (savedUrl) {
          await get().loadPlaylist(savedUrl, savedEpg || undefined)
        }
      } catch (err) {
        console.warn('[Store] Restauration automatique échouée :', err)
      }
    },

    setCurrentView: (view) => {
      set({ currentView: view })
    },

    setAccentColor: (color) => {
      storageService.setAccentColor(color)
      applyAccent(color)
      set({ accentColor: color })
    },

    setDeviceModePreference: (mode) => {
      storageService.setDeviceModePreference(mode)
      set({ deviceModePreference: mode })
    },

    setConnectionMode: (mode) => {
      storageService.setConnectionMode(mode)
      set({ connectionMode: mode, errorMessage: null })
    },

    setLocalSyncUrl: (url) => {
      const clean = url.trim()
      try {
        if (clean) localStorage.setItem(SYNC_URL_KEY, clean)
        else localStorage.removeItem(SYNC_URL_KEY)
      } catch {
        // ignore
      }
      set({ localSyncUrl: clean })
    },

    /**
     * PROTOCOLE 1 : LIEN M3U / M3U8
     */
    loadPlaylist: async (url, epgUrl) => {
      const cleanUrl = url.trim()
      if (!cleanUrl) {
        set({ status: 'error', errorMessage: 'Saisissez l’adresse de votre playlist M3U.' })
        return
      }

      set({ status: 'loading', errorMessage: null, playlistUrl: cleanUrl, parsingProgress: 0, connectionMode: 'm3u' })

      try {
        const result = await m3uService.loadFromUrl(cleanUrl, get().preferredProxy, (prog) => {
          set({ parsingProgress: prog })
        })
        if (result.channels.length === 0) {
          throw new Error('Aucune chaîne lisible dans cette playlist M3U.')
        }

        const { live, movies, series } = splitM3uContent(groupChannelsByQuality(result.channels))
        storageService.setConnectionMode('m3u')
        storageService.setPlaylistUrl(cleanUrl)
        applyLiveChannels(live, { vodMovies: movies, vodSeries: series })
        startEpg(epgUrl)
      } catch (err) {
        failWith(err, 'Chargement de la playlist M3U impossible.')
      }
    },

    /**
     * PROTOCOLE 2 : API XTREAM CODES
     */
    loadXtream: async (creds, epgUrl) => {
      if (!creds.serverUrl || !creds.username || !creds.password) {
        set({ status: 'error', errorMessage: 'Renseignez l’adresse du serveur, l’identifiant et le mot de passe.' })
        return
      }

      set({ status: 'loading', errorMessage: null, xtreamCreds: creds, parsingProgress: null, connectionMode: 'xtream' })

      try {
        const [liveResult, vodMovies, vodSeries] = await Promise.all([
          xtreamService.loadLiveContent(creds),
          xtreamService.getVodStreams(creds).catch(() => []),
          xtreamService.getSeriesStreams(creds).catch(() => []),
        ])

        storageService.setConnectionMode('xtream')
        storageService.setXtreamCredentials(creds)
        applyLiveChannels(groupChannelsByQuality(liveResult.channels), {
          vodMovies,
          vodSeries,
          xtreamUserInfo: liveResult.userInfo || null,
        })
        // Guide : adresse choisie, sinon celui du fournisseur (réglage activé par défaut)
        if (epgUrl && epgUrl.trim()) startEpg(epgUrl)
        else if (getPlaybackPrefs().autoProviderEpg) void get().loadProviderEpg()
      } catch (err) {
        failWith(err, 'Connexion au serveur Xtream Codes impossible.')
      }
    },

    /**
     * PROTOCOLE 3 : PORTAIL STALKER / MAG (MINISTRA)
     */
    loadStalker: async (creds, epgUrl) => {
      if (!creds.portalUrl || !creds.macAddress) {
        set({ status: 'error', errorMessage: 'Renseignez l’adresse du portail et l’adresse MAC.' })
        return
      }

      set({ status: 'loading', errorMessage: null, stalkerCreds: creds, parsingProgress: null, connectionMode: 'stalker' })

      try {
        const result = await stalkerService.loadContent(creds)
        storageService.setConnectionMode('stalker')
        storageService.setStalkerCredentials(creds)
        applyLiveChannels(groupChannelsByQuality(result.channels), {
          vodMovies: [],
          vodSeries: [],
          stalkerToken: result.token,
        })
        startEpg(epgUrl)
      } catch (err) {
        failWith(err, 'Connexion au portail MAG / Stalker impossible.')
      }
    },

    /**
     * PROTOCOLE 4 : ENIGMA2 / BOUQUETS
     */
    loadEnigma: async (creds, epgUrl) => {
      if (!creds.hostUrl) {
        set({ status: 'error', errorMessage: 'Renseignez l’adresse IP de votre décodeur Enigma2.' })
        return
      }

      set({ status: 'loading', errorMessage: null, enigmaCreds: creds, parsingProgress: null, connectionMode: 'enigma2' })

      try {
        const result = await enigmaService.getAllServices(creds)
        storageService.setConnectionMode('enigma2')
        storageService.setEnigmaCredentials(creds)
        applyLiveChannels(groupChannelsByQuality(result.channels), { vodMovies: [], vodSeries: [] })
        startEpg(epgUrl)
      } catch (err) {
        failWith(err, 'Connexion au décodeur Enigma2 impossible.')
      }
    },

    /**
     * FICHIER M3U LOCAL (mémorisé dans IndexedDB pour les prochains lancements)
     */
    loadFromLocalFile: async (content, fileName = 'playlist.m3u', epgUrl) => {
      if (!content || content.length < 20) {
        set({ status: 'error', errorMessage: 'Ce fichier est vide ou n’est pas une playlist M3U.' })
        return
      }

      const sourceLabel = `${LOCAL_FILE_PREFIX}${fileName}`
      set({ status: 'loading', errorMessage: null, playlistUrl: sourceLabel, parsingProgress: 0, connectionMode: 'm3u' })

      try {
        const result = await m3uService.parseContent(content, (prog) => set({ parsingProgress: prog }))
        if (result.channels.length === 0) {
          throw new Error('Aucune chaîne détectée dans ce fichier M3U.')
        }

        const { live, movies, series } = splitM3uContent(groupChannelsByQuality(result.channels))
        storageService.setConnectionMode('m3u')
        storageService.setPlaylistUrl(sourceLabel)
        void fileStore.savePlaylist(fileName, content)
        applyLiveChannels(live, { vodMovies: movies, vodSeries: series })
        startEpg(epgUrl)
      } catch (err) {
        failWith(err, 'Lecture du fichier impossible.')
      }
    },

    reloadSource: async () => {
      const s = get()
      const epg = s.epgUrl || undefined
      if (s.connectionMode === 'xtream' && s.xtreamCreds) return s.loadXtream(s.xtreamCreds, epg)
      if (s.connectionMode === 'stalker' && s.stalkerCreds) return s.loadStalker(s.stalkerCreds, epg)
      if (s.connectionMode === 'enigma2' && s.enigmaCreds) return s.loadEnigma(s.enigmaCreds, epg)
      if (s.playlistUrl?.startsWith(LOCAL_FILE_PREFIX)) {
        const stored = await fileStore.loadPlaylist()
        if (stored) return s.loadFromLocalFile(stored.content, stored.name, epg)
        return
      }
      if (s.playlistUrl) return s.loadPlaylist(s.playlistUrl, epg)
    },

    /**
     * GUIDE DES PROGRAMMES (EPG - XMLTV)
     */
    loadEpg: async (epgUrl) => {
      const cleanUrl = epgUrl.trim()
      if (!cleanUrl) return

      set({ epgStatus: 'loading', epgUrl: cleanUrl })
      storageService.setEpgUrl(cleanUrl)

      try {
        await epgService.loadEpgFromUrl(cleanUrl, get().preferredProxy)
        set((state) => ({
          ...enrichAll(state),
          epgStatus: 'success',
          epgVersion: state.epgVersion + 1,
        }))
      } catch {
        set({ epgStatus: 'error' })
      }
    },

    loadProviderEpg: async () => {
      const creds = get().xtreamCreds
      if (!creds) return
      await get().loadEpg(xtreamService.buildXmltvUrl(creds))
    },

    // Met à jour le programme « en cours » de chaque chaîne (appelé chaque minute)
    refreshNowPlaying: () => {
      if (!epgService.hasData()) return
      set((state) => enrichAll(state))
    },

    toggleFavorite: (id) => {
      const favorites = get().favorites
      const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]
      storageService.setFavorites(next)
      set({ favorites: next })
      scheduleSync()
    },

    saveResumePoint: (id, currentTime, duration) => {
      const nextPoints = {
        ...get().vodResumePoints,
        [id]: { id, currentTime, duration, updatedAt: Date.now() },
      }
      writeResumePoints(nextPoints)
      set({ vodResumePoints: nextPoints })
      scheduleSync()
    },

    clearResumePoint: (id) => {
      const nextPoints = { ...get().vodResumePoints }
      delete nextPoints[id]
      writeResumePoints(nextPoints)
      set({ vodResumePoints: nextPoints })
      scheduleSync()
    },

    exportBackup: () => {
      backupService.exportToFile(buildPayload())
    },

    importBackup: (jsonStr) => {
      try {
        const imported = backupService.parseBackupString(jsonStr)
        const merged = backupService.mergeData(buildPayload(), imported)
        const accent = normalizeAccent(merged.accentColor)

        storageService.setFavorites(merged.favorites)
        storageService.setConnectionMode(merged.connectionMode)
        if (merged.playlistUrl) storageService.setPlaylistUrl(merged.playlistUrl)
        if (merged.xtreamCreds) storageService.setXtreamCredentials(merged.xtreamCreds)
        if (merged.stalkerCreds) storageService.setStalkerCredentials(merged.stalkerCreds)
        if (merged.enigmaCreds) storageService.setEnigmaCredentials(merged.enigmaCreds)
        if (merged.epgUrl) storageService.setEpgUrl(merged.epgUrl)
        storageService.setAccentColor(accent)
        applyAccent(accent)
        writeResumePoints(merged.vodResumePoints)
        if (merged.localSyncUrl) get().setLocalSyncUrl(merged.localSyncUrl)

        set({
          favorites: merged.favorites,
          connectionMode: merged.connectionMode,
          playlistUrl: merged.playlistUrl,
          xtreamCreds: merged.xtreamCreds,
          stalkerCreds: merged.stalkerCreds,
          enigmaCreds: merged.enigmaCreds,
          epgUrl: merged.epgUrl,
          accentColor: accent,
          vodResumePoints: merged.vodResumePoints,
        })
        return true
      } catch (err) {
        console.error('[Sauvegarde] Import impossible :', err)
        return false
      }
    },

    selectCategory: (category) => {
      set({ selectedCategory: category })
    },

    setCategoriesHidden: (categories, hidden) => {
      const state = get()
      const current = new Set(state.hiddenCategories)
      for (const c of categories) {
        if (hidden) current.add(c)
        else current.delete(c)
      }
      const next = [...current]
      storageService.setHiddenCategories(next)
      set({
        hiddenCategories: next,
        channels: visibleChannels(state.allChannels, next),
        categories: state.allCategories.filter((c) => !current.has(c)),
        // Une catégorie qu'on vient de masquer ne peut pas rester sélectionnée
        selectedCategory: current.has(state.selectedCategory) ? 'ALL' : state.selectedCategory,
      })
    },

    setParentalPin: (pin) => {
      const clean = pin.replace(/D/g, '').slice(0, 4)
      const state = get()
      // Premier code : les bouquets adultes sont verrouillés d'office (modifiable ensuite)
      const locked =
        clean && !state.parentalPin && state.lockedCategories.length === 0
          ? state.allCategories.filter((c) => isAdultCategory(c))
          : state.lockedCategories
      set({ parentalPin: clean, lockedCategories: locked, parentalUnlocked: false })
      saveParental()
    },

    setCategoriesLocked: (categories, locked) => {
      const current = new Set(get().lockedCategories)
      for (const c of categories) {
        if (locked) current.add(c)
        else current.delete(c)
      }
      set({ lockedCategories: [...current] })
      saveParental()
    },

    setLockAdultVod: (locked) => {
      set({ lockAdultVod: locked })
      saveParental()
    },

    isChannelLocked: (channel) => {
      const { parentalPin, parentalUnlocked, lockedCategories } = get()
      if (!parentalPin || parentalUnlocked) return false
      if (channel.streamType === 'movie' || channel.streamType === 'series') return false
      return lockedCategories.includes(channelCategory(channel))
    },

    isVodLocked: (item) => {
      const { parentalPin, parentalUnlocked, lockAdultVod } = get()
      return !!parentalPin && !parentalUnlocked && lockAdultVod && isAdultCategory(item.category)
    },

    submitParentalPin: (pin) => {
      const { parentalPin, pendingUnlock } = get()
      if (!parentalPin || pin !== parentalPin) return false
      set({ parentalUnlocked: true, pendingUnlock: null })
      if (pendingUnlock?.kind === 'channel') get().setActiveChannel(pendingUnlock.channel)
      if (pendingUnlock?.kind === 'vod') get().openVodDetail(pendingUnlock.item)
      return true
    },

    cancelUnlock: () => set({ pendingUnlock: null }),

    setSearchQuery: (query) => {
      set({ searchQuery: query })
    },

    setActiveChannel: (channel) => {
      if (!channel) {
        set({ activeChannel: null })
        return
      }
      if (get().isChannelLocked(channel)) {
        set({ pendingUnlock: { kind: 'channel', channel } })
        return
      }
      // L'historique « Reprendre » ne garde que les chaînes en direct
      if (!channel.streamType || channel.streamType === 'live') {
        if (!channel.name.startsWith('[Replay]')) {
          storageService.addRecentChannel(channel)
          set((state) => ({
            recentlyWatched: [channel, ...state.recentlyWatched.filter((c) => c.id !== channel.id)].slice(0, 15),
          }))
        }
      }
      set({ activeChannel: channel })
    },

    playVod: (item, options = {}) => {
      if (get().isVodLocked(item)) {
        set({ pendingUnlock: { kind: 'vod', item } })
        return
      }
      const { episode, fromStart } = options
      const vodId = episode ? `${item.id}_ep_${episode.id}` : item.id
      const resume = get().vodResumePoints[vodId]
      const streamUrl = episode ? episode.streamUrl : item.streamUrl
      if (!streamUrl) return

      // Lecteur externe choisi dans les réglages (application Android)
      const external = getPlaybackPrefs().externalPlayer
      if (isNativeApp && external !== 'internal' && !options.forceInternal) {
        const title = episode ? `${item.cleanTitle} · S${episode.season} É${episode.episodeNum}` : item.cleanTitle
        void openInExternalPlayer(streamUrl, external, title).then((opened) => {
          if (!opened) get().playVod(item, { ...options, forceInternal: true })
        })
        set({ vodDetail: null })
        return
      }

      set({
        vodDetail: null,
        activeChannel: {
          id: vodId,
          name: item.cleanTitle,
          subtitle: episode ? `S${String(episode.season).padStart(2, '0')} · É${String(episode.episodeNum).padStart(2, '0')} — ${episode.title}` : item.year,
          logo: item.logo,
          streamUrl,
          url: streamUrl,
          category: item.category,
          group: item.category,
          streamId: item.streamId,
          streamType: item.type === 'movie' ? 'movie' : 'series',
          vodId,
          resumeFrom: !fromStart && resume && resume.currentTime > 10 ? resume.currentTime : 0,
        },
      })
    },

    playChannelNumber: (num) => {
      const target = get().channels.find((c) => c.number === num)
      if (!target) return false
      get().setActiveChannel(target)
      return true
    },

    playNextChannel: () => {
      const next = stepChannel(get(), 1)
      if (next) get().setActiveChannel(next)
    },

    playPreviousChannel: () => {
      const prev = stepChannel(get(), -1)
      if (prev) get().setActiveChannel(prev)
    },

    openVodDetail: (item) => {
      if (get().isVodLocked(item)) set({ pendingUnlock: { kind: 'vod', item } })
      else set({ vodDetail: item })
    },
    closeVodDetail: () => set({ vodDetail: null }),

    resetPlaylist: () => {
      storageService.clearPlaylistUrl()
      storageService.clearXtreamCredentials()
      storageService.clearStalkerCredentials()
      storageService.clearEnigmaCredentials()
      void fileStore.clear()

      set({
        channels: [],
        allChannels: [],
        vodMovies: [],
        vodSeries: [],
        categories: [],
        allCategories: [],
        categoryCounts: {},
        status: 'idle',
        errorMessage: null,
        playlistUrl: null,
        xtreamCreds: null,
        xtreamUserInfo: null,
        stalkerCreds: null,
        stalkerToken: null,
        enigmaCreds: null,
        activeChannel: null,
        vodDetail: null,
        selectedCategory: 'ALL',
        searchQuery: '',
        currentView: 'home',
      })
    },

    clearCacheAndReload: () => {
      storageService.clearAllData()
      void fileStore.clear().finally(() => window.location.reload())
    },

    setPreferredProxy: (proxyId) => {
      set({ preferredProxy: proxyId })
    },
  }
})
