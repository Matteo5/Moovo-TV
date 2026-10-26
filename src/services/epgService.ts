import type { Channel, EpgProgram } from '../types/iptv'
import { fetchWithCors } from './corsProxy'

/**
 * Parse une date au format XMLTV : "YYYYMMDDHHMMSS +0200" ou "YYYYMMDDHHMMSS"
 */
export function parseXmltvDate(rawDate?: string | null): Date {
  if (!rawDate) return new Date()

  const str = rawDate.trim()
  const year = parseInt(str.substring(0, 4), 10)
  const month = parseInt(str.substring(4, 6), 10) - 1
  const day = parseInt(str.substring(6, 8), 10)
  const hour = parseInt(str.substring(8, 10), 10) || 0
  const minute = parseInt(str.substring(10, 12), 10) || 0
  const second = parseInt(str.substring(12, 14), 10) || 0

  // Si un décalage de fuseau horaire est spécifié (ex: "+0200" ou "-0500")
  const tzMatch = str.match(/([+-])(\d{2})(\d{2})$/)
  if (tzMatch) {
    const sign = tzMatch[1] === '+' ? 1 : -1
    const tzHours = parseInt(tzMatch[2], 10)
    const tzMins = parseInt(tzMatch[3], 10)
    const totalTzOffsetMinutes = sign * (tzHours * 60 + tzMins)

    // Calcul en UTC puis ajustement
    const utcMs = Date.UTC(year, month, day, hour, minute, second) - totalTzOffsetMinutes * 60 * 1000
    return new Date(utcMs)
  }

  return new Date(year, month, day, hour, minute, second)
}

const CHANNEL_RE = /<channel\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g
const PROGRAMME_RE = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g
const DISPLAY_NAME_RE = /<display-name[^>]*>([\s\S]*?)<\/display-name>/
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/
const DESC_RE = /<desc[^>]*>([\s\S]*?)<\/desc>/
const CATEGORY_RE = /<category[^>]*>([\s\S]*?)<\/category>/
const ATTR_RES = {
  channel: /\bchannel="([^"]*)"/,
  start: /\bstart="([^"]*)"/,
  stop: /\bstop="([^"]*)"/,
}

function attr(attrs: string, name: keyof typeof ATTR_RES): string | null {
  const m = ATTR_RES[name].exec(attrs)
  return m ? decodeXml(m[1]) : null
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

export class EpgService {
  private programsByChannel: Map<string, EpgProgram[]> = new Map()
  private channelNameMap: Map<string, string> = new Map() // display-name lowercase -> channel id

  /**
   * Télécharge et analyse un fichier EPG XMLTV
   */
  async loadEpgFromUrl(
    epgUrl: string,
    preferredProxy: string = 'auto'
  ): Promise<{ totalPrograms: number; totalChannels: number }> {
    // Les adresses Xtream contiennent identifiant et mot de passe : jamais en clair dans la console
    console.log('[EPG XMLTV] Chargement du guide des programmes depuis :', epgUrl.replace(/(username|password)=[^&]*/gi, '$1=…'))

    const { text } = await fetchWithCors(epgUrl, preferredProxy)

    if (!text.includes('<programme') && !/<tv[s>]/.test(text.slice(0, 4096))) {
      throw new Error('Le fichier fourni n’est pas un guide XMLTV.')
    }

    this.programsByChannel.clear()
    this.channelNameMap.clear()

    // Lecture séquentielle par expressions régulières plutôt que DOMParser : un guide de fournisseur
    // pèse souvent 50 à 150 Mo, et un arbre DOM complet ferait exploser la mémoire d'un boîtier TV.
    for (const m of text.matchAll(CHANNEL_RE)) {
      const name = DISPLAY_NAME_RE.exec(m[2])
      if (name) this.channelNameMap.set(decodeXml(name[1]).toLowerCase(), decodeXml(m[1]))
    }

    // On ne garde que la fenêtre utile au guide (8 jours en arrière pour le replay, 4 jours en avant)
    const windowStart = Date.now() - 8 * 86_400_000
    const windowEnd = Date.now() + 4 * 86_400_000
    let count = 0
    let scanned = 0

    for (const m of text.matchAll(PROGRAMME_RE)) {
      // Rend la main au navigateur régulièrement pour garder l'interface fluide
      if (++scanned % 4000 === 0) await new Promise((r) => setTimeout(r, 0))

      const attrs = m[1]
      const channelId = attr(attrs, 'channel')
      const startStr = attr(attrs, 'start')
      const stopStr = attr(attrs, 'stop')
      if (!channelId || !startStr || !stopStr) continue

      const start = parseXmltvDate(startStr)
      const stop = parseXmltvDate(stopStr)
      if (stop.getTime() < windowStart || start.getTime() > windowEnd) continue

      const inner = m[2]
      const prog: EpgProgram = {
        channelId,
        title: decodeXml(TITLE_RE.exec(inner)?.[1] || '') || 'Programme',
        description: decodeXml(DESC_RE.exec(inner)?.[1] || '') || undefined,
        category: decodeXml(CATEGORY_RE.exec(inner)?.[1] || '') || undefined,
        start,
        stop,
      }

      let list = this.programsByChannel.get(channelId)
      if (!list) {
        list = []
        this.programsByChannel.set(channelId, list)
      }
      list.push(prog)
      count++
    }

    for (const [, list] of this.programsByChannel) {
      list.sort((x, y) => x.start.getTime() - y.start.getTime())
    }

    console.log(`[EPG XMLTV] ${count} programmes retenus pour ${this.programsByChannel.size} chaînes.`)
    return { totalPrograms: count, totalChannels: this.programsByChannel.size }
  }

  /**
   * Récupère le programme en cours pour une chaîne donnée
   */
  getCurrentProgram(channel: Channel): EpgProgram | null {
    const idCandidates = [
      channel.epgId,
      channel.tvgId,
      channel.name ? this.channelNameMap.get(channel.name.toLowerCase()) : null,
      channel.name,
      channel.id,
    ].filter(Boolean) as string[]

    const now = new Date().getTime()

    for (const id of idCandidates) {
      const list = this.programsByChannel.get(id)
      if (list && list.length > 0) {
        for (const prog of list) {
          const startTime = prog.start.getTime()
          const stopTime = prog.stop.getTime()

          if (startTime <= now && now <= stopTime) {
            const totalDuration = stopTime - startTime
            const elapsed = now - startTime
            const progress = totalDuration > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100))) : 0

            return {
              ...prog,
              progress,
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Liste complète des programmes connus pour une chaîne (triés par heure de début)
   */
  private findProgramList(channel: Channel): EpgProgram[] {
    const idCandidates = [
      channel.epgId,
      channel.tvgId,
      channel.name ? this.channelNameMap.get(channel.name.toLowerCase()) : null,
      channel.name,
      channel.id,
    ].filter(Boolean) as string[]

    for (const id of idCandidates) {
      const list = this.programsByChannel.get(id)
      if (list && list.length > 0) return list
    }
    return []
  }

  /**
   * Programmes qui chevauchent la plage [from, to]
   */
  getProgramsInRange(channel: Channel, from: Date, to: Date): EpgProgram[] {
    const fromMs = from.getTime()
    const toMs = to.getTime()
    return this.findProgramList(channel).filter(
      (p) => p.stop.getTime() > fromMs && p.start.getTime() < toMs
    )
  }

  /**
   * Programme en cours et les suivants (pour l'OSD du lecteur et la fiche chaîne)
   */
  getUpcoming(channel: Channel, count = 4): EpgProgram[] {
    const now = Date.now()
    return this.findProgramList(channel)
      .filter((p) => p.stop.getTime() > now)
      .slice(0, count)
  }

  /**
   * Enrichit une liste de chaînes avec les programmes EPG actuels
   */
  enrichChannelsWithEpg(channels: Channel[]): Channel[] {
    if (this.programsByChannel.size === 0) return channels

    return channels.map((ch) => {
      const current = this.getCurrentProgram(ch)
      if (current) {
        return {
          ...ch,
          currentProgram: current,
        }
      }
      return ch
    })
  }

  /**
   * Indique si des données EPG sont actuellement chargées en mémoire
   */
  hasData(): boolean {
    return this.programsByChannel.size > 0
  }

  /** Oublie le guide chargé (changement de playlist). */
  clear(): void {
    this.programsByChannel.clear()
    this.channelNameMap.clear()
  }
}

export const epgService = new EpgService()
