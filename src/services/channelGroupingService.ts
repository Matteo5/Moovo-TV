import type { Channel, QualityVariant } from '../types/iptv'

const QUALITY_ORDER: Record<string, number> = {
  '4K': 4,
  FHD: 3,
  HD: 2,
  SD: 1,
  AUTO: 0,
}

/**
 * Détecte la qualité à partir du nom de la chaîne
 */
export function detectQualityFromName(name: string): QualityVariant['quality'] {
  const upper = name.toUpperCase()
  if (/\b(4K|UHD|2160P)\b/.test(upper)) return '4K'
  if (/\b(FHD|1080P)\b/.test(upper)) return 'FHD'
  if (/\b(HD|720P)\b/.test(upper)) return 'HD'
  if (/\b(SD|576P|480P)\b/.test(upper)) return 'SD'
  return 'HD'
}

const COUNTRY_CODES = 'DE|TR|UK|IT|ES|PT|AR|NL|PL|RO|AL|GR|BE|CH|US|FR'
const COUNTRY_PREFIX = new RegExp(`^(${COUNTRY_CODES})\\s*[.|:]\\s*|^(${COUNTRY_CODES})\\s+(?=\\S)`)

/**
 * Nettoie le nom de base en retirant les suffixes de qualité et d'encodage
 * Exemple : "BEIN SPORTS 1 FHD [FR]" -> "BEIN SPORTS 1"
 */
export function extractCleanBaseName(name: string): string {
  let clean = name.trim()
  // Code pays du fournisseur en tête (« DE PRO 7 », « AR.BEIN … », « TR| TRT 1 ») : la catégorie le dit déjà
  const prefix = clean.match(COUNTRY_PREFIX)
  if (prefix && clean.length > prefix[0].length + 1) {
    const code = prefix[1] || prefix[2]
    clean = clean.slice(prefix[0].length).replace(new RegExp(`\\s+${code}$`), '')
  }
  // Retirer les crochets et parenthèses
  clean = clean.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ')
  // Retirer les tags de qualité
  clean = clean.replace(/\b(4K|UHD|FHD|HD|SD|HEVC|H\.265|x265|1080p|720p|2160p)\b/gi, ' ')
  // Retirer les codes pays récurrents en suffixe
  clean = clean.replace(/\b(FR|VF|VOSTFR|MULTI|TRUEFRENCH)\b/gi, ' ')
  // Nettoyer les tirets et espaces multiples
  clean = clean.replace(/[-|:_]/g, ' ')
  clean = clean.replace(/\s+/g, ' ').trim()
  // Mot répété par le fournisseur : « BEIN BEIN Sports » → « BEIN Sports »
  clean = clean.replace(/(^|\s)(\S+)(?:\s+\2)+(?=\s|$)/gi, '$1$2')

  return clean || name.trim()
}

// Intitulés de rubrique que certains fournisseurs glissent comme fausses chaînes
const SEPARATOR_WORDS =
  /^(generalistes?|informations?|infos?|news|sports?|cinemas?|films?|series|jeunesse|enfants?|kids|documentaires?|decouvertes?|musiques?|music|divertissements?|regionales?|regions?|religieuses?|thematiques?|adultes?|xxx)$/

/** Fausse chaîne servant de séparateur (« ===== SPORT ===== », « GENERALISTES », « Welcome … »). */
export function isSeparatorChannel(name: string): boolean {
  const raw = name.trim()
  if (/^welcome\b/i.test(raw)) return true
  // Décor de symboles autour d'un intitulé
  if (/^[#*=~•★☆_|\-\s]{3,}/.test(raw) || /[#*=~•★☆_|\-]{3,}\s*$/.test(raw)) return true
  const plain = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
  return raw === raw.toUpperCase() && SEPARATOR_WORDS.test(plain)
}

/**
 * Regroupe intelligemment les chaînes ayant le même nom de base dans la même catégorie
 */
export function groupChannelsByQuality(channels: Channel[]): Channel[] {
  const map = new Map<string, { main: Channel; variants: QualityVariant[] }>()

  for (const ch of channels) {
    if (isSeparatorChannel(ch.name)) continue
    const cleanName = extractCleanBaseName(ch.name)
    const key = `${ch.category || ch.group || 'Général'}___${cleanName.toLowerCase()}`
    const detectedQ = detectQualityFromName(ch.name)

    const variant: QualityVariant = {
      quality: detectedQ,
      streamUrl: ch.streamUrl,
      tsUrl: ch.tsUrl,
      m3u8Url: ch.m3u8Url,
      originalName: ch.name,
    }

    if (!map.has(key)) {
      map.set(key, {
        main: {
          ...ch,
          cleanName,
        },
        variants: [variant],
      })
    } else {
      const entry = map.get(key)!
      // Éviter les variantes en doublon exact d'URL
      if (!entry.variants.some((v) => v.streamUrl === ch.streamUrl)) {
        entry.variants.push(variant)
      }
    }
  }

  // Finaliser chaque chaîne avec sa liste de qualités triées par résolution descendante
  const result: Channel[] = []

  for (const [, { main, variants }] of map) {
    // Trier de la plus haute à la plus basse (4K -> FHD -> HD -> SD)
    variants.sort((a, b) => (QUALITY_ORDER[b.quality] || 0) - (QUALITY_ORDER[a.quality] || 0))

    const best = variants[0]

    result.push({
      ...main,
      name: main.cleanName || main.name,
      streamUrl: best.streamUrl,
      url: best.streamUrl,
      tsUrl: best.tsUrl || main.tsUrl,
      m3u8Url: best.m3u8Url || main.m3u8Url,
      qualities: variants.length > 1 ? variants : undefined,
      selectedQuality: best.quality,
    })
  }

  return result
}
