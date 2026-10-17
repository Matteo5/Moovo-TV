import React, { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Heart, History, Lock, Search, X } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { Channel } from '../types/iptv'
import { VirtualList } from '../components/VirtualList'
import { ChannelLogo } from '../ui/ChannelLogo'
import { formatTime, programProgress } from '../ui/Program'
import { useNow } from '../hooks/useNow'
import { useLockedCategorySet } from '../hooks/useParentalFilter'
import {
  ALL,
  FAVORITES,
  UNIVERSES,
  type Universe,
  categoryLabel,
  categoryUniverse,
  channelCategory,
  filterBySelection,
  selectionUniverse,
  universeSelection,
} from '../services/categoryService'
import { BarButton, Pills } from './parts'

const ChannelRow: React.FC<{
  channel: Channel
  now: number
  isFavorite: boolean
  locked: boolean
  showCategory: boolean
  onPlay: (c: Channel) => void
  onFavorite: (id: string) => void
}> = React.memo(({ channel, now, isFavorite, locked, showCategory, onPlay, onFavorite }) => {
  const program = channel.currentProgram
  return (
    <div className="flex h-full items-center gap-1 px-[var(--m-gutter)]">
      <button type="button" onClick={() => onPlay(channel)} className="m-press flex h-full min-w-0 flex-1 items-center gap-3 text-left">
        <span className="w-8 shrink-0 text-right font-mono text-[0.78rem] font-bold text-fog tabular">{channel.number ?? ''}</span>
        {locked ? (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[0.75rem] bg-ink-850" aria-label="Verrouillée">
            <Lock className="size-4 text-brand-magenta" />
          </span>
        ) : (
          <ChannelLogo logo={channel.logo} name={channel.name} className="size-12 shrink-0 rounded-[0.75rem]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[0.95rem] font-semibold text-paper">{channel.name}</span>
            {channel.catchupDays ? <History className="size-3.5 shrink-0 text-brand-cyan" aria-label="Replay disponible" /> : null}
          </span>
          {program ? (
            <>
              <span className="mt-0.5 block truncate text-[0.82rem] text-mist">
                <span className="font-mono text-[0.74rem] text-fog tabular">{formatTime(program.start)}</span> {program.title}
              </span>
              <span className="mt-1.5 block h-[3px] w-full max-w-[9rem] overflow-hidden rounded-full bg-white/12">
                <span className="block h-full rounded-full bg-onair" style={{ width: `${programProgress(program, now)}%` }} />
              </span>
            </>
          ) : (
            showCategory && <span className="mt-0.5 block truncate text-[0.8rem] text-fog">{categoryLabel(channelCategory(channel))}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onFavorite(channel.id)}
        aria-label={isFavorite ? `Retirer ${channel.name} des favoris` : `Ajouter ${channel.name} aux favoris`}
        aria-pressed={isFavorite}
        className="m-press flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <Heart className={`size-[1.15rem] ${isFavorite ? 'fill-brand-magenta text-brand-magenta' : 'text-fog'}`} />
      </button>
    </div>
  )
})
ChannelRow.displayName = 'ChannelRow'

const MobileLive: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const categories = useIptvStore((s) => s.categories)
  const categoryCounts = useIptvStore((s) => s.categoryCounts)
  const favorites = useIptvStore((s) => s.favorites)
  const selectedCategory = useIptvStore((s) => s.selectedCategory)
  const selectCategory = useIptvStore((s) => s.selectCategory)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const now = useNow()
  const [filter, setFilter] = useState('')
  const [searching, setSearching] = useState(false)

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const lockedSet = useLockedCategorySet()
  const hasFavorites = channels.some((c) => favoriteSet.has(c.id))

  const byUniverse = useMemo(() => {
    const map: Record<Universe, string[]> = { france: [], sport: [], world: [], other: [] }
    for (const cat of categories) map[categoryUniverse(cat)].push(cat)
    return map
  }, [categories])

  const universes = useMemo(
    () =>
      UNIVERSES.filter((u) => byUniverse[u.id].length > 0).map((u) => ({
        id: universeSelection(u.id),
        label: u.label,
        count: byUniverse[u.id].reduce((sum, cat) => sum + (categoryCounts[cat] || 0), 0),
      })),
    [byUniverse, categoryCounts]
  )

  const selectionIsValid =
    selectedCategory === FAVORITES || selectionUniverse(selectedCategory) !== null || categories.includes(selectedCategory)

  useEffect(() => {
    if (!selectionIsValid && universes.length > 0) selectCategory(universes[0].id)
  }, [selectionIsValid, universes, selectCategory])

  const activeUniverse: Universe | null =
    selectedCategory === FAVORITES ? null : selectionUniverse(selectedCategory) ?? (categories.includes(selectedCategory) ? categoryUniverse(selectedCategory) : null)
  const universeTab = selectedCategory === FAVORITES ? FAVORITES : activeUniverse ? universeSelection(activeUniverse) : universes[0]?.id ?? FAVORITES
  const bouquets = activeUniverse ? byUniverse[activeUniverse] : []

  const list = useMemo(() => {
    let result = filterBySelection(channels, selectionIsValid ? selectedCategory : ALL, favoriteSet)
    const q = filter.trim().toLowerCase()
    if (q) {
      const asNumber = parseInt(q, 10)
      result = result.filter((c) => c.name.toLowerCase().includes(q) || (asNumber > 0 && c.number === asNumber))
    }
    return result
  }, [channels, selectedCategory, selectionIsValid, favoriteSet, filter])

  const mixed = selectedCategory === FAVORITES || selectionUniverse(selectedCategory) !== null
  const tabs = [...(hasFavorites ? [{ id: FAVORITES, label: 'Favoris', count: channels.filter((c) => favoriteSet.has(c.id)).length }] : []), ...universes]

  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex h-11 items-center justify-end gap-2 px-[var(--m-gutter)]">
          <BarButton label={searching ? 'Fermer la recherche' : 'Chercher une chaîne'} onClick={() => {
            setSearching((s) => !s)
            setFilter('')
          }}>
            {searching ? <X className="size-5" /> : <Search className="size-5" />}
          </BarButton>
          <BarButton label="Guide TV" onClick={() => setCurrentView('epg')}>
            <CalendarClock className="size-5" />
          </BarButton>
        </div>
        <h1 className="m-display mt-1 px-[var(--m-gutter)] text-[2.6rem]">Direct</h1>
        {searching && (
          <label className="relative mx-[var(--m-gutter)] mt-3 flex items-center animate-m-fade">
            <Search className="pointer-events-none absolute left-3.5 size-[1.1rem] text-fog" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              type="search"
              inputMode="search"
              placeholder="Nom ou numéro de chaîne"
              className="h-11 w-full rounded-[0.8rem] bg-white/[0.08] pl-10 pr-4 text-[0.95rem] text-paper placeholder:text-fog focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        )}
        <Pills ariaLabel="Univers" options={tabs} value={universeTab} onChange={(id) => selectCategory(id)} className="mt-3" />
        {bouquets.length > 1 && (
          <div className="m-rail mt-1 gap-4 pb-2 pt-1">
            {[{ id: universeSelection(activeUniverse!), label: 'Tous les bouquets' }, ...bouquets.map((b) => ({ id: b, label: categoryLabel(b) }))].map((b) => {
              const on = selectedCategory === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => selectCategory(b.id)}
                  aria-pressed={on}
                  className={`relative shrink-0 py-1.5 text-[0.84rem] font-semibold transition-colors ${on ? 'text-paper' : 'text-fog'}`}
                >
                  {b.label}
                  {on && <span className="streak absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        )}
        <div className="h-px bg-white/[0.06]" />
      </header>

      {list.length > 0 ? (
        <VirtualList
          items={list}
          rowHeightRem={4.75}
          getKey={(c) => c.id}
          resetKey={`${selectedCategory}|${filter}`}
          className="no-scrollbar min-h-0 flex-1 overscroll-contain pb-[var(--m-tabbar)]"
          renderRow={(c) => (
            <ChannelRow
              channel={c}
              now={now}
              isFavorite={favoriteSet.has(c.id)}
              locked={!!lockedSet?.has(channelCategory(c))}
              showCategory={mixed}
              onPlay={setActiveChannel}
              onFavorite={toggleFavorite}
            />
          )}
        />
      ) : (
        <p className="px-[var(--m-gutter)] py-12 text-center text-mist">
          {filter ? `Aucune chaîne ne correspond à « ${filter} ».` : 'Aucune chaîne dans cette sélection.'}
        </p>
      )}
    </div>
  )
}

export default MobileLive
