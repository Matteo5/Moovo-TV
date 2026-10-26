import React from 'react'
import { Cpu, Link2, Lock, Plus, Satellite, Server } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { SavedPlaylist } from '../services/playlistsService'
import type { ConnectionMode } from '../types/iptv'
import { Wordmark } from '../ui/Brand'

export const PLAYLIST_TYPES: Record<ConnectionMode, { label: string; icon: React.ReactNode }> = {
  xtream: { label: 'Xtream Codes', icon: <Server className="size-6" /> },
  m3u: { label: 'Playlist M3U', icon: <Link2 className="size-6" /> },
  stalker: { label: 'Portail MAG', icon: <Cpu className="size-6" /> },
  enigma2: { label: 'Enigma2', icon: <Satellite className="size-6" /> },
}

/** Playlists enregistrées, la dernière utilisée en premier. */
export function sortedPlaylists(list: SavedPlaylist[]): SavedPlaylist[] {
  return [...list].sort((a, b) => b.lastUsed - a.lastUsed)
}

/** Tuiles des playlists enregistrées : un appui ouvre la playlist (son code d'abord si elle en a un). */
export const PlaylistTiles: React.FC<{ autofocus?: boolean; onAdd?: () => void }> = ({ autofocus, onAdd }) => {
  const playlists = useIptvStore((s) => s.playlists)
  const activeId = useIptvStore((s) => s.activePlaylistId)
  const openPlaylist = useIptvStore((s) => s.openPlaylist)
  const sorted = sortedPlaylists(playlists)

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">
      {sorted.map((p, i) => {
        const type = PLAYLIST_TYPES[p.mode]
        return (
          <button
            key={p.id}
            type="button"
            data-autofocus={(autofocus && i === 0) || undefined}
            onClick={() => void openPlaylist(p.id)}
            className="tile tile-frame flex items-center gap-4 rounded-2xl bg-ink-900 p-5 text-left ring-1 ring-white/6 hover:bg-ink-850"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-accent">{type.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-wide text-lg font-bold leading-tight">{p.name}</span>
              <span className="mt-1 block truncate text-sm text-fog">
                {type.label}
                {p.id === activeId ? ' · dernière ouverte' : ''}
              </span>
            </span>
            {p.pin && <Lock className="size-5 shrink-0 text-brand-magenta" aria-label="Protégée par un code" />}
          </button>
        )
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="tile tile-frame flex items-center gap-4 rounded-2xl border border-dashed border-white/15 p-5 text-left text-mist hover:border-white/30 hover:text-paper"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-ink-850">
            <Plus className="size-6" />
          </span>
          <span className="font-wide text-lg font-bold">Ajouter une playlist</span>
        </button>
      )}
    </div>
  )
}

/** Écran de démarrage quand plusieurs playlists sont enregistrées (ou que la dernière est protégée). */
export const PlaylistPicker: React.FC = () => {
  const setPlaylistPicker = useIptvStore((s) => s.setPlaylistPicker)
  const errorMessage = useIptvStore((s) => s.errorMessage)

  return (
    <div className="min-h-dvh bg-ink-950 px-[var(--gutter)] pb-16 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-4xl">
        <Wordmark className="-ml-3 h-12 md:h-14" />
        <h1 className="mt-10 font-xwide text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">Quelle playlist ?</h1>
        <p className="mt-3 text-lg text-mist">Choisissez l’abonnement à ouvrir.</p>
        {errorMessage && (
          <p role="alert" className="mt-6 rounded-2xl bg-onair/10 px-5 py-4 text-onair ring-1 ring-onair/30">
            {errorMessage}
          </p>
        )}
        <div className="mt-8">
          <PlaylistTiles autofocus onAdd={() => setPlaylistPicker(false)} />
        </div>
      </div>
    </div>
  )
}
