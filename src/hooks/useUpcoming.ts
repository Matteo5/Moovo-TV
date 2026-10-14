import { useEffect, useState } from 'react'
import type { Channel, EpgProgram } from '../types/iptv'
import { epgService } from '../services/epgService'
import { xtreamService } from '../services/xtreamService'
import { useIptvStore } from '../store/useIptvStore'

const shortEpgCache = new Map<string, { at: number; programs: EpgProgram[] }>()
const CACHE_MS = 5 * 60_000

/**
 * Programme en cours et suivants d'une chaîne : guide XMLTV s'il est chargé,
 * sinon guide court du panel Xtream (une requête légère, mise en cache 5 minutes).
 */
export function useUpcoming(channel: Channel | null | undefined, count = 4, debounceMs = 350): EpgProgram[] {
  const xtreamCreds = useIptvStore((s) => s.xtreamCreds)
  const epgVersion = useIptvStore((s) => s.epgVersion)
  const [remote, setRemote] = useState<{ id: string; programs: EpgProgram[] } | null>(null)

  const local = channel && epgService.hasData() ? epgService.getUpcoming(channel, count) : []
  const needsRemote = !!channel && local.length === 0 && !!xtreamCreds && channel.streamId !== undefined && (!channel.streamType || channel.streamType === 'live')

  useEffect(() => {
    if (!needsRemote || !channel || !xtreamCreds) return
    const key = String(channel.streamId)
    const cached = shortEpgCache.get(key)
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setRemote({ id: channel.id, programs: cached.programs })
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const programs = await xtreamService.getShortEpg(xtreamCreds, channel.streamId!, count)
      shortEpgCache.set(key, { at: Date.now(), programs })
      if (!cancelled) setRemote({ id: channel.id, programs })
    }, debounceMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [needsRemote, channel, xtreamCreds, count, debounceMs, epgVersion])

  if (local.length > 0) return local
  if (remote && channel && remote.id === channel.id) {
    const now = Date.now()
    return remote.programs.filter((p) => p.stop.getTime() > now)
  }
  return []
}
