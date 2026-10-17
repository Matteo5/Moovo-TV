import { useSyncExternalStore } from 'react'

/**
 * Préférences de lecture (enregistrées sur l'appareil).
 */
export type BufferProfile = 'short' | 'normal' | 'long'

export interface PlaybackPrefs {
  /** Tampon : court = démarrage rapide, long = plus stable sur une connexion irrégulière. */
  buffer: BufferProfile
  /** Langue audio préférée (code ISO 639-1 : « fr », « en »…) ; vide = piste par défaut du flux. */
  audioLang: string
  /** Sous-titres : « off » ou code de langue. */
  subtitleLang: string
  /** Lecteur des films et séries : « internal », « ask » (choix à chaque fois) ou nom de paquet Android. */
  externalPlayer: string
  /** Charge automatiquement le guide XMLTV du fournisseur Xtream. */
  autoProviderEpg: boolean
}

const KEY = 'moovo_playback_prefs'

const DEFAULTS: PlaybackPrefs = {
  buffer: 'normal',
  audioLang: 'fr',
  subtitleLang: 'off',
  externalPlayer: 'internal',
  autoProviderEpg: true,
}

function read(): PlaybackPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()

export function getPlaybackPrefs(): PlaybackPrefs {
  return current
}

export function setPlaybackPrefs(patch: Partial<PlaybackPrefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Stockage indisponible : la préférence vaut pour la session
  }
  listeners.forEach((l) => l())
}

export function usePlaybackPrefs(): PlaybackPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current
  )
}

/** Réglages hls.js correspondant au profil de tampon. */
export function hlsBufferConfig(profile: BufferProfile, isLive: boolean) {
  switch (profile) {
    case 'short':
      return { maxBufferLength: 10, maxMaxBufferLength: 20, liveSyncDurationCount: 2, backBufferLength: isLive ? 10 : 30 }
    case 'long':
      return { maxBufferLength: 60, maxMaxBufferLength: 120, liveSyncDurationCount: 5, backBufferLength: isLive ? 60 : 120 }
    default:
      return { maxBufferLength: 30, maxMaxBufferLength: 60, liveSyncDurationCount: 3, backBufferLength: isLive ? 30 : 90 }
  }
}

/** Nom lisible d'une langue (« fr » → « français »). */
export function languageName(code: string | undefined): string {
  if (!code) return 'Inconnue'
  try {
    const name = new Intl.DisplayNames(['fr'], { type: 'language' }).of(code.split(/[-_]/)[0])
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
  } catch {
    return code
  }
}

/** Compare un code de langue de piste (« fre », « fra », « fr-FR »…) à la préférence. */
export function languageMatches(trackLang: string | undefined, pref: string): boolean {
  if (!trackLang || !pref) return false
  const t = trackLang.toLowerCase()
  const aliases: Record<string, string[]> = {
    fr: ['fr', 'fre', 'fra', 'french', 'français', 'vf', 'vff'],
    en: ['en', 'eng', 'english', 'anglais'],
    es: ['es', 'spa', 'spanish', 'español'],
    de: ['de', 'ger', 'deu', 'german', 'deutsch'],
    it: ['it', 'ita', 'italian'],
    pt: ['pt', 'por', 'portuguese'],
    ar: ['ar', 'ara', 'arabic'],
  }
  const list = aliases[pref] || [pref]
  return list.some((a) => t === a || t.startsWith(`${a}-`) || t.startsWith(`${a}_`))
}

export const LANGUAGE_CHOICES: { code: string; label: string }[] = [
  { code: '', label: 'Par défaut du flux' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'ar', label: 'Arabe' },
]

export const EXTERNAL_PLAYERS: { id: string; label: string }[] = [
  { id: 'internal', label: 'Lecteur Moovo TV' },
  { id: 'ask', label: 'Choisir à chaque fois' },
  { id: 'org.videolan.vlc', label: 'VLC' },
  { id: 'org.courville.nova', label: 'Nova Video Player' },
  { id: 'com.mxtech.videoplayer.ad', label: 'MX Player' },
  { id: 'com.mxtech.videoplayer.pro', label: 'MX Player Pro' },
  { id: 'com.brouken.player', label: 'Just Player' },
  { id: 'com.newin.nplayer.pro', label: 'nPlayer' },
]

/** Lecteurs de l'iPhone, ouverts par leur schéma d'URL (pas de détection possible sans code natif). */
export const IOS_PLAYERS: { id: string; label: string; hint?: string }[] = [
  { id: 'internal', label: 'Lecteur Moovo TV', hint: 'Lecteur intégré basé sur VLC : tous les formats (.mkv, .avi…), pistes audio et sous-titres' },
  { id: 'ios-vlc', label: 'Toujours VLC' },
  { id: 'ios-infuse', label: 'Toujours Infuse' },
]
