import React, { useEffect, useMemo, useState } from 'react'
import { Heart, Play, Search, X, History, Layers, Lock } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { Channel } from '../types/iptv'
import { VirtualList } from '../components/VirtualList'
import { ChannelLogo } from '../ui/ChannelLogo'
import { Button, Chip } from '../ui/Button'
import { ChannelNumber, OnAirDot, ProgressLine, formatTime, programProgress } from '../ui/Program'
import { useNow } from '../hooks/useNow'
import { useUpcoming } from '../hooks/useUpcoming'
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

const ChannelRow: React.FC<{
  channel: Channel
  now: number
  selected: boolean
  isFavorite: boolean
  showCategory: boolean
  locked?: boolean
  onFocusChannel: (c: Channel) => void
  onPlay: (c: Channel) => void
}> = React.memo(({ channel, now, selected, isFavorite, showCategory, locked, onFocusChannel, onPlay }) => {
  const program = channel.currentProgram
  return (
    <button
      type="button"
      onClick={() => onPlay(channel)}
      onFocus={() => onFocusChannel(channel)}
      onMouseEnter={() => onFocusChannel(channel)}
      className={`group relative mx-2 flex h-[calc(100%-0.25rem)] w-[calc(100%-1rem)] items-center gap-4 rounded-xl px-3 text-left transition-colors ${
        selected ? 'bg-ink-800' : 'hover:bg-ink-850 focus-visible:bg-ink-800'
      }`}
    >
      {selected && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-accent" />}
      <ChannelNumber value={channel.number} className={`w-11 shrink-0 text-sm ${selected ? 'text-accent' : 'text-fog'}`} />
      {locked ? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink-800 tv:size-9" aria-label="Verrouillée">
          <Lock className="size-4 text-brand-magenta" />
        </span>
      ) : (
        <ChannelLogo logo={channel.logo} name={channel.name} className="size-11 shrink-0 tv:size-9" />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-semibold text-paper">
          <span className="truncate">{channel.name}</span>
          {isFavorite && <Heart className="size-3.5 shrink-0 fill-accent text-accent" />}
          {channel.catchupDays ? <History className="size-3.5 shrink-0 text-brand-cyan" aria-label="Replay disponible" /> : null}
          {channel.qualities && channel.qualities.length > 1 && (
            <span className="shrink-0 rounded bg-white/8 px-1.5 font-mono text-[0.65rem] text-mist">{channel.selectedQuality}</span>
          )}
        </p>
        {program ? (
          <div className="mt-1 flex items-center gap-3 tv:mt-0.5">
            <span className="truncate text-sm text-mist">{program.title}</span>
            <ProgressLine value={programProgress(program, now)} className="hidden w-16 shrink-0 sm:block" />
          </div>
        ) : (
          // Sans programme, le bouquet n'est rappelé que si la liste en mélange plusieurs
          showCategory && <p className="mt-0.5 truncate text-sm text-fog">{categoryLabel(channelCategory(channel))}</p>
        )}
      </div>
    </button>
  )
})
ChannelRow.displayName = 'ChannelRow'

const ChannelDetail: React.FC<{ channel: Channel; now: number }> = ({ channel, now }) => {
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const isFavorite = useIptvStore((s) => s.favorites.includes(channel.id))
  const upcoming = useUpcoming(channel, 5)
  const current = upcoming.find((p) => p.start.getTime() <= now && p.stop.getTime() > now) || channel.currentProgram
  const next = upcoming.filter((p) => p.start.getTime() > now).slice(0, 4)

  return (
    <aside className="flex h-full flex-col overflow-y-auto rounded-3xl bg-ink-900 p-7 ring-1 ring-white/6" data-nav-skip>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink-850">
        <ChannelLogo logo={channel.logo} name={channel.name} className="absolute inset-0 m-auto size-[52%] bg-transparent" />
        <span className="absolute left-4 top-3 font-mono text-sm font-bold text-accent tabular">
          {channel.number ? `CH ${String(channel.number).padStart(3, '0')}` : ''}
        </span>
        <div className="streak absolute inset-x-0 bottom-0 h-1.5" />
      </div>

      <h2 className="mt-6 font-wide text-2xl font-bold leading-tight tracking-tight">{channel.name}</h2>
      <p className="mt-1 text-sm text-fog">{categoryLabel(channelCategory(channel))}</p>

      {current ? (
        <div className="mt-6">
          <OnAirDot label="En ce moment" />
          <p className="mt-2 text-lg font-semibold">{current.title}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-xs text-mist tabular">
              {formatTime(current.start)} – {formatTime(current.stop)}
            </span>
            <ProgressLine value={programProgress(current, now)} className="flex-1" />
          </div>
          {current.description && <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-mist">{current.description}</p>}
        </div>
      ) : (
        <p className="mt-6 text-sm text-fog">Pas d’informations de programme pour cette chaîne.</p>
      )}

      {next.length > 0 && (
        <ol className="mt-6 space-y-3 border-t border-white/6 pt-5">
          {next.map((p) => (
            <li key={`${p.start.getTime()}-${p.title}`} className="flex gap-4 text-sm">
              <span className="w-12 shrink-0 font-mono text-fog tabular">{formatTime(p.start)}</span>
              <span className="truncate text-mist">{p.title}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-auto flex gap-3 pt-6">
        <Button variant="primary" className="flex-1" icon={<Play className="size-4 fill-current" />} onClick={() => setActiveChannel(channel)}>
          Regarder
        </Button>
        <Button
          aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          icon={<Heart className={`size-4 ${isFavorite ? 'fill-accent text-accent' : ''}`} />}
          onClick={() => toggleFavorite(channel.id)}
        />
      </div>
    </aside>
  )
}

/** Bandeau d'infos de la chaîne sélectionnée, quand la fiche latérale n'a pas la place (TV, tablette). */
const ChannelInfoStrip: React.FC<{ channel: Channel; now: number }> = ({ channel, now }) => {
  const upcoming = useUpcoming(channel, 3)
  const current = upcoming.find((p) => p.start.getTime() <= now && p.stop.getTime() > now) || channel.currentProgram
  const next = upcoming.find((p) => p.start.getTime() > now)
  return (
    <div className="mx-[var(--gutter)] mb-3 hidden h-[4.75rem] items-center gap-4 rounded-2xl bg-ink-900 px-4 ring-1 ring-white/5 md:flex xl:hidden tv:hidden">
      <ChannelLogo logo={channel.logo} name={channel.name} className="size-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-3 truncate">
          <ChannelNumber value={channel.number} className="text-sm text-accent" />
          <span className="truncate font-semibold">{channel.name}</span>
        </p>
        {current ? (
          <div className="mt-1 flex items-center gap-3 text-sm">
            <span className="truncate text-mist">{current.title}</span>
            <ProgressLine value={programProgress(current, now)} className="w-16 shrink-0" />
            {next && (
              <span className="hidden truncate text-fog lg:inline">
                <span className="font-mono tabular">{formatTime(next.start)}</span> {next.title}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 truncate text-sm text-fog">{categoryLabel(channelCategory(channel))}</p>
        )}
      </div>
    </div>
  )
}

const CategoryButton: React.FC<{ label: string; count: number; active: boolean; onSelect: () => void; icon?: React.ReactNode }> = ({
  label,
  count,
  active,
  onSelect,
  icon,
}) => (
  <button
    type="button"
    onClick={onSelect}
    // À la télécommande, passer sur une catégorie l'affiche directement (comme sur un décodeur)
    onFocus={(e) => {
      if (!active && e.currentTarget.matches(':focus-visible')) onSelect()
    }}
    aria-pressed={active}
    data-autofocus={active || undefined}
    title={label}
    className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-colors tv:py-2 ${
      active ? 'bg-paper text-ink-950' : 'text-mist hover:bg-white/5 hover:text-paper'
    }`}
  >
    {icon}
    <span className="flex-1 truncate font-semibold">{label}</span>
    <span className={`font-mono text-xs tabular ${active ? 'text-ink-700' : 'text-fog'}`}>{count}</span>
  </button>
)

/** Onglet d'univers (France, Sport, Monde…) : comme les catégories, il s'affiche dès qu'on passe dessus. */
const UniverseTab: React.FC<{
  label: string
  count: number
  active: boolean
  autofocus?: boolean
  icon?: React.ReactNode
  onSelect: () => void
}> = ({ label, count, active, autofocus, icon, onSelect }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    data-autofocus={autofocus || undefined}
    onClick={onSelect}
    onFocus={(e) => {
      if (!active && e.currentTarget.matches(':focus-visible')) onSelect()
    }}
    className={`relative flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-4 font-wide text-[0.95rem] font-bold tracking-tight transition-colors tv:h-10 ${
      active ? 'bg-ink-800 text-paper' : 'text-fog hover:bg-white/5 hover:text-paper'
    }`}
  >
    {icon}
    {label}
    <span className={`font-mono text-xs font-normal tabular ${active ? 'text-accent' : 'text-fog'}`}>{count}</span>
    {active && <span className="absolute inset-x-4 -bottom-1 h-0.5 rounded-full bg-accent" />}
  </button>
)

const LiveView: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const categories = useIptvStore((s) => s.categories)
  const categoryCounts = useIptvStore((s) => s.categoryCounts)
  const favorites = useIptvStore((s) => s.favorites)
  const selectedCategory = useIptvStore((s) => s.selectedCategory)
  const selectCategory = useIptvStore((s) => s.selectCategory)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  // Abonnement au mode d'affichage : la hauteur des lignes en dépend
  useIptvStore((s) => s.deviceModePreference)
  const isTv = typeof document !== 'undefined' && document.documentElement.dataset.device === 'tv'
  const now = useNow()
  const [filter, setFilter] = useState('')
  const [focused, setFocused] = useState<Channel | null>(null)

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const lockedSet = useLockedCategorySet()

  // Catégories rangées par univers, dans l'ordre du fournisseur
  const byUniverse = useMemo(() => {
    const map: Record<Universe, string[]> = { france: [], sport: [], world: [], other: [] }
    for (const cat of categories) map[categoryUniverse(cat)].push(cat)
    return map
  }, [categories])

  const universes = useMemo(
    () =>
      UNIVERSES.filter((u) => byUniverse[u.id].length > 0).map((u) => ({
        ...u,
        count: byUniverse[u.id].reduce((sum, cat) => sum + (categoryCounts[cat] || 0), 0),
      })),
    [byUniverse, categoryCounts]
  )

  const selectionIsValid =
    selectedCategory === FAVORITES || selectionUniverse(selectedCategory) !== null || categories.includes(selectedCategory)

  // « Toutes » ou une catégorie disparue (masquée, autre playlist) : on ouvre le premier univers
  useEffect(() => {
    if (!selectionIsValid && universes.length > 0) selectCategory(universeSelection(universes[0].id))
  }, [selectionIsValid, universes, selectCategory])

  const activeUniverse: Universe | null =
    selectedCategory === FAVORITES
      ? null
      : selectionUniverse(selectedCategory) ?? (categories.includes(selectedCategory) ? categoryUniverse(selectedCategory) : universes[0]?.id ?? null)
  const universeCategories = activeUniverse ? byUniverse[activeUniverse] : []
  const universeInfo = universes.find((u) => u.id === activeUniverse)
  const showColumn = activeUniverse !== null

  const list = useMemo(() => {
    let result = filterBySelection(channels, selectionIsValid ? selectedCategory : ALL, favoriteSet)
    const q = filter.trim().toLowerCase()
    if (q) {
      const asNumber = parseInt(q, 10)
      result = result.filter((c) => c.name.toLowerCase().includes(q) || (asNumber > 0 && c.number === asNumber))
    }
    return result
  }, [channels, selectedCategory, selectionIsValid, favoriteSet, filter])

  // Le bouquet n'est utile sous le nom de la chaîne que si la liste en mélange plusieurs
  const mixedList = selectedCategory === FAVORITES || selectionUniverse(selectedCategory) !== null

  const detail = (focused && list.find((c) => c.id === focused.id)) || list[0] || null

  const categoryTitle =
    selectedCategory === FAVORITES
      ? 'Favoris'
      : selectionUniverse(selectedCategory)
        ? universeInfo?.label ?? 'Direct'
        : categoryLabel(selectedCategory)

  return (
    <div className="flex h-full flex-col">
      {/* En-tête */}
      <div className="flex flex-wrap items-end gap-4 px-[var(--gutter)] pb-4 pt-5 md:pt-8 tv:hidden">
        <div className="mr-auto min-w-0">
          <h1 className="mt-1 truncate font-xwide text-3xl font-extrabold tracking-tight md:text-4xl">{categoryTitle}</h1>
        </div>
        <label className="relative flex w-full items-center sm:w-80">
          <Search className="pointer-events-none absolute left-4 size-4 text-fog" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Nom ou numéro de chaîne"
            className="h-11 w-full rounded-xl bg-ink-850 pl-11 pr-10 text-paper placeholder:text-fog ring-1 ring-white/6 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {filter && (
            <button type="button" aria-label="Effacer" onClick={() => setFilter('')} className="absolute right-2 rounded-lg p-1.5 text-fog hover:text-paper">
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      {/* Univers */}
      <div
        role="tablist"
        aria-label="Univers"
        className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto px-[var(--gutter)] pb-3 tv:pb-4 tv:pt-[calc(var(--gutter)*0.6)]"
      >
        {universes.map((u) => (
          <UniverseTab
            key={u.id}
            label={u.label}
            count={u.count}
            active={activeUniverse === u.id}
            onSelect={() => selectCategory(universeSelection(u.id))}
          />
        ))}
        <UniverseTab
          label="Favoris"
          count={favorites.length}
          active={selectedCategory === FAVORITES}
          autofocus={selectedCategory === FAVORITES}
          icon={<Heart className={`size-4 ${selectedCategory === FAVORITES ? 'fill-accent text-accent' : ''}`} />}
          onSelect={() => selectCategory(FAVORITES)}
        />
      </div>

      {/* Bouquets de l'univers en puces (mobile) */}
      {showColumn && universeInfo && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-[var(--gutter)] pb-4 md:hidden">
          <Chip selected={selectionUniverse(selectedCategory) !== null} count={universeInfo.count} onClick={() => selectCategory(universeSelection(universeInfo.id))}>
            Tout
          </Chip>
          {universeCategories.map((cat) => (
            <Chip key={cat} selected={selectedCategory === cat} count={categoryCounts[cat]} onClick={() => selectCategory(cat)}>
              {categoryLabel(cat)}
            </Chip>
          ))}
        </div>
      )}

      {detail && <ChannelInfoStrip channel={detail} now={now} />}

      <div
        className={`grid min-h-0 flex-1 gap-4 px-[var(--gutter)] pb-[var(--gutter)] ${
          showColumn ? 'md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_25rem] tv:grid-cols-[17rem_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_25rem]'
        }`}
      >
        {/* Bouquets de l'univers (tablette et plus) */}
        {showColumn && universeInfo && (
          // Marge intérieure : le halo du focus ne doit pas être rogné par le défilement
          <nav aria-label="Bouquets" data-nav-entry data-nav-exit-up className="-m-2 hidden min-h-0 space-y-1 overflow-y-auto p-2 md:block tv:-m-3 tv:p-3">
            <CategoryButton
              label={`Tout ${universeInfo.label === 'Autres' ? '' : universeInfo.label}`.trim()}
              count={universeInfo.count}
              active={selectionUniverse(selectedCategory) !== null}
              onSelect={() => selectCategory(universeSelection(universeInfo.id))}
              icon={<Layers className="size-4 shrink-0" />}
            />
            {universeCategories.length > 1 && <div className="mx-4 my-2 h-px bg-white/6" />}
            {universeCategories.length > 1 &&
              universeCategories.map((cat) => (
                <CategoryButton key={cat} label={categoryLabel(cat)} count={categoryCounts[cat] || 0} active={selectedCategory === cat} onSelect={() => selectCategory(cat)} />
              ))}
          </nav>
        )}

        {/* Liste des chaînes */}
        <div className="min-h-0 rounded-3xl bg-ink-900/60 py-2 ring-1 ring-white/5">
          {list.length > 0 ? (
            <VirtualList
              items={list}
              rowHeightRem={isTv ? 3.6 : 4.75}
              resetKey={`${selectedCategory}|${filter}`}
              getKey={(c) => c.id}
              className="h-full"
              renderRow={(c) => (
                <ChannelRow
                  channel={c}
                  now={now}
                  selected={detail?.id === c.id}
                  isFavorite={favoriteSet.has(c.id)}
                  showCategory={mixedList}
                  locked={!!lockedSet?.has(channelCategory(c))}
                  onFocusChannel={setFocused}
                  onPlay={setActiveChannel}
                />
              )}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <p className="font-wide text-xl font-bold">
                {selectedCategory === FAVORITES && !filter ? 'Aucune chaîne favorite' : 'Aucune chaîne trouvée'}
              </p>
              <p className="mt-2 max-w-sm text-mist">
                {selectedCategory === FAVORITES && !filter
                  ? 'Ajoutez des favoris depuis la fiche d’une chaîne ou pendant la lecture.'
                  : 'Essayez un autre nom, un numéro, ou une autre catégorie.'}
              </p>
            </div>
          )}
        </div>

        {/* Fiche (grand écran) */}
        <div className="hidden min-h-0 xl:block tv:hidden">{detail && <ChannelDetail channel={detail} now={now} />}</div>
      </div>
    </div>
  )
}

export default LiveView
