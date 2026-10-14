import type { Channel } from '../types/iptv'

/**
 * Classement des catégories du direct en « univers » (France, Sport, Monde, Autres) et noms lisibles.
 *
 * Les fournisseurs livrent des dizaines de bouquets à plat (« BOUQUET LIGUE1+ FR », « BOUQUET TURC »…) :
 * à la télécommande, on choisit d'abord un univers puis un bouquet parmi une poignée.
 * Le classement se fait sur le nom du bouquet, il ne dépend donc pas d'un fournisseur précis.
 */
export type Universe = 'france' | 'sport' | 'world' | 'other'

export const UNIVERSES: { id: Universe; label: string }[] = [
  { id: 'france', label: 'France' },
  { id: 'sport', label: 'Sport' },
  { id: 'world', label: 'Monde' },
  { id: 'other', label: 'Autres' },
]

/** Sélections spéciales du direct ; sinon la sélection est le nom brut d'une catégorie. */
export const ALL = 'ALL'
export const FAVORITES = 'FAVORITES'
const UNIVERSE_PREFIX = 'U:'

export const universeSelection = (u: Universe) => `${UNIVERSE_PREFIX}${u}`

export function selectionUniverse(selection: string): Universe | null {
  if (!selection.startsWith(UNIVERSE_PREFIX)) return null
  const id = selection.slice(UNIVERSE_PREFIX.length)
  return UNIVERSES.some((u) => u.id === id) ? (id as Universe) : null
}

export const channelCategory = (c: Channel) => c.group || c.category || 'Général'

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[|:_\-/.,()[\]]+/g, ' ')
}

const ADULT = /\b(ADULTES?|ADULT|XXX|18\s?\+|\+\s?18)(\b|$)/
const FRANCOPHONE = /\b(FR|FRANCE|FRANCAIS\w*|FRENCH|VF|BELG\w*|BE|SUISSE|SWISS|CH|QUEBEC|CANADA|TNT|CANAL\w*|THEMATIQ\w*)\b/
const FOREIGN =
  /\b(ARAB\w*|AR|OSN|MBC|MAGHREB|ALGERIE|MAROC|TUNISIE|ITALI\w*|ITALY|IT|PORTUG\w*|PT|BRESIL|BRAZIL|ESPAGN\w*|SPAIN|ESPANA|ES|LATINO?|GERMAN\w*|ALLEMAG\w*|DEUTSCH\w*|DE|AUSTRIA|AUTRICHE|ANGLAIS|ENGLISH|UK|USA|US|IRELAND|IRLANDE|TURC|TURK\w*|TR|NL|NEDERLAND|DUTCH|POLOGNE|POLSKA|PL|ROUMANIE|ROMANIA|RO|ALBAN\w*|EX ?YU|BALKAN\w*|GREC\w*|GREECE|GR|RUSS\w*|RU|INDE|INDIA\w*|PAKISTAN|AFRIQUE|AFRICA|KURD\w*|IRAN|PERSIAN|ASIA\w*|CHIN\w*|SCANDINAV\w*|NORDIC)\b/
// Genres écrits en français : bouquet d'un fournisseur francophone
const FRENCH_GENRES = /\b(INFOS?|CINEMA|FILMS|DOCUMENTAIRES?|DECOUVERTE|JEUNESSE|ENFANTS?|MUSIQUE|SERIES|DIVERTISSEMENT|REGIONS?|GENERALISTES?)\b/
const SPORT =
  /\b(SPORTS?|LIGUE ?\d?|DAZN|BEIN|EUROSPORT|NBA|NFL|NHL|MLB|UFC|WWE|SKWEEK|FOOT\w*|SOCCER|F1|FORMULE|TENNIS|RUGBY|GOLF|PPV|EVENTS?|MATCH\w*|CYCLISME|BOXE|BOXING|MOTO\w*)/

const universeCache = new Map<string, Universe>()

/** Catégorie pour adultes (bouquet du direct ou genre de films), d'après son nom. */
export function isAdultCategory(raw: string | undefined): boolean {
  return !!raw && ADULT.test(normalize(raw))
}

/** Univers d'une catégorie, d'après son nom. */
export function categoryUniverse(raw: string): Universe {
  const cached = universeCache.get(raw)
  if (cached) return cached
  const n = normalize(raw)
  let u: Universe
  if (ADULT.test(n)) u = 'other'
  else if (FOREIGN.test(n) && !FRANCOPHONE.test(n)) u = 'world'
  else if (SPORT.test(n)) u = 'sport'
  else if (FRANCOPHONE.test(n) || FRENCH_GENRES.test(n)) u = 'france'
  else u = 'other'
  universeCache.set(raw, u)
  return u
}

// Mots dont la graphie est connue ; les sigles courts restent en capitales
const WORDS: Record<string, string> = {
  BEIN: 'beIN',
  'LIGUE1+': 'Ligue 1+',
  LIGUE1: 'Ligue 1',
  CINE: 'Ciné',
  'CINE+': 'Ciné+',
  FRANCAIS: 'Français',
  FRANCAISES: 'Françaises',
  THEMATIQUES: 'Thématiques',
  THEMATIQUE: 'Thématique',
  GERMANY: 'Allemagne',
  DOCUMENTAIRES: 'Documentaires',
  CINEMA: 'Cinéma',
  SERIES: 'Séries',
  MUSIQUE: 'Musique',
  ENFANTS: 'Enfants',
}
const ACRONYMS = new Set(['RMC', 'DAZN', 'NBA', 'NFL', 'UFC', 'OSN', 'MBC', 'TV', 'HD', 'FHD', 'UHD', 'SD', '4K', 'HEVC', 'AR', 'UK', 'USA', 'TNT', 'F1', 'PPV', 'VIP', 'VOD', 'BFM', 'RTL', 'TF1', 'M6'])
const LOWER = new Set(['ET', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'EN', 'AU', 'AUX', 'D', 'L'])

const labelCache = new Map<string, string>()

/** Nom de catégorie lisible : « BOUQUET LIGUE1+ FR » → « Ligue 1+ », « CHAINES THEMATIQUES » → « Thématiques ». */
export function categoryLabel(raw: string): string {
  const cached = labelCache.get(raw)
  if (cached) return cached
  let s = raw.trim()
  // Préfixe de pays façon « FR| », « |UK| » ou « FR: » : inutile pour la France, gardé pour les autres pays
  s = s.replace(/^\|?\s*([A-Z]{2,3})\s*[|:]\s*/, (_, code: string) => (code === 'FR' ? '' : `${code} `))
  s = s.replace(/^(BOUQUETS?|PACKS?|CHA[IÎ]NES)\s+/i, '')
  // Le suffixe « FR » n'apporte rien dans une interface française
  s = s.replace(/\s+(FR|FRANCE)$/i, '')
  // Fournisseur qui écrit déjà en casse normale : on lui fait confiance
  if (/[a-z]/.test(s)) {
    labelCache.set(raw, s || raw)
    return s || raw
  }
  const label = s
    .split(/\s+/)
    .map((word, i) => {
      const key = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      if (WORDS[key]) return WORDS[key]
      if (ACRONYMS.has(key)) return key
      if (i > 0 && LOWER.has(key)) return word.toLowerCase()
      return word.charAt(0) + word.slice(1).toLowerCase()
    })
    .join(' ')
  labelCache.set(raw, label || raw)
  return label || raw
}

/** Chaînes correspondant à une sélection du direct (univers, catégorie, favoris ou tout). */
export function filterBySelection(channels: Channel[], selection: string, favorites: ReadonlySet<string> | string[]): Channel[] {
  if (selection === ALL) return channels
  if (selection === FAVORITES) {
    const set = favorites instanceof Set ? favorites : new Set(favorites as string[])
    return channels.filter((c) => set.has(c.id))
  }
  const universe = selectionUniverse(selection)
  if (universe) return channels.filter((c) => categoryUniverse(channelCategory(c)) === universe)
  return channels.filter((c) => channelCategory(c) === selection)
}
