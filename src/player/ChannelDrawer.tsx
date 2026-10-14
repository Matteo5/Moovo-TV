import React, { useEffect, useMemo, useState } from 'react'
import { Heart, X } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { categoryLabel } from '../services/categoryService'
import type { Channel } from '../types/iptv'
import { VirtualList } from '../components/VirtualList'
import { ChannelLogo } from '../ui/ChannelLogo'
import { ChannelNumber, ProgressLine, programProgress } from '../ui/Program'
import { useBackHandler, goBack } from '../hooks/useBackHandler'
import { useNow } from '../hooks/useNow'

type Scope = 'group' | 'favorites' | 'all'

/** Tiroir de zapping : la liste des chaînes par-dessus l'image, comme sur un décodeur. */
export const ChannelDrawer: React.FC<{ current: Channel; onClose: () => void }> = ({ current, onClose }) => {
  const channels = useIptvStore((s) => s.channels)
  const favorites = useIptvStore((s) => s.favorites)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const [scope, setScope] = useState<Scope>('group')
  const now = useNow()

  useBackHandler(true, onClose)

  const group = current.group || current.category
  const list = useMemo(() => {
    if (scope === 'favorites') return channels.filter((c) => favorites.includes(c.id))
    if (scope === 'group') return channels.filter((c) => (c.group || c.category) === group)
    return channels
  }, [channels, favorites, scope, group])

  const currentIndex = list.findIndex((c) => c.id === current.id)

  // Focus initial sur la chaîne en cours
  useEffect(() => {
    const id = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-drawer] [data-current="true"]') || document.querySelector<HTMLElement>('[data-drawer] [data-channel]')
      el?.focus()
    }, 80)
    return () => window.clearTimeout(id)
  }, [scope])

  const tabs: { id: Scope; label: string }[] = [
    { id: 'group', label: group ? categoryLabel(group) : 'Catégorie' },
    { id: 'favorites', label: 'Favoris' },
    { id: 'all', label: 'Toutes' },
  ]

  return (
    <>
    {/* Toucher l'image ferme le tiroir */}
    <button
      type="button"
      aria-label="Fermer la liste des chaînes"
      data-nav-skip
      onClick={() => goBack()}
      className="absolute inset-0 z-[29] cursor-default bg-black/30"
    />
    <aside
      data-nav-trap
      data-drawer
      className="absolute inset-y-0 left-0 z-30 flex w-full max-w-[26rem] flex-col bg-ink-950/92 pt-[env(safe-area-inset-top)] backdrop-blur-2xl ring-1 ring-white/8 animate-slide-in"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <p className="flex-1 font-wide text-lg font-bold">Chaînes</p>
        <button
          type="button"
          onClick={() => goBack()}
          aria-label="Fermer la liste des chaînes"
          className="flex size-11 items-center justify-center rounded-full bg-white/8 text-paper hover:bg-white/15"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex gap-1 px-4 pb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setScope(t.id)}
            aria-pressed={scope === t.id}
            className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2.5 text-sm font-semibold ${
              scope === t.id ? 'bg-paper text-ink-950' : 'text-mist hover:bg-white/6'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="px-6 py-10 text-mist">Aucune chaîne dans cette liste.</p>
      ) : (
        <VirtualList
          items={list}
          rowHeightRem={4.5}
          resetKey={scope}
          scrollToIndex={currentIndex}
          getKey={(c) => c.id}
          className="min-h-0 flex-1 pb-4"
          renderRow={(c) => {
            const isCurrent = c.id === current.id
            return (
              <button
                type="button"
                data-channel
                data-current={isCurrent}
                onClick={() => setActiveChannel(c)}
                className={`mx-3 flex h-[calc(100%-0.25rem)] w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl px-3 text-left ${
                  isCurrent ? 'bg-accent-soft' : 'hover:bg-white/5 focus-visible:bg-white/8'
                }`}
              >
                <ChannelNumber value={c.number} className={`w-10 text-sm ${isCurrent ? 'text-accent' : 'text-fog'}`} />
                <ChannelLogo logo={c.logo} name={c.name} className="size-10 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 truncate font-semibold">
                    <span className="truncate">{c.name}</span>
                    {favorites.includes(c.id) && <Heart className="size-3 shrink-0 fill-accent text-accent" />}
                  </span>
                  {c.currentProgram ? (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="truncate text-xs text-mist">{c.currentProgram.title}</span>
                      <ProgressLine value={programProgress(c.currentProgram, now)} className="w-10 shrink-0" />
                    </span>
                  ) : (
                    <span className="block truncate text-xs text-fog">{c.group ? categoryLabel(c.group) : ''}</span>
                  )}
                </span>
              </button>
            )
          }}
        />
      )}
    </aside>
    </>
  )
}
