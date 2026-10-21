import React, { useMemo, useState } from 'react'
import { Search, X, ArrowDownAZ, Star, ListOrdered, Flame, CalendarPlus } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { VodItem, VodResumePoint } from '../types/iptv'
import { PosterGrid } from '../components/PosterGrid'
import { PosterCard } from '../components/PosterCard'
import { Row } from '../components/Row'
import { Chip } from '../ui/Button'
import { categoryLabel } from '../services/categoryService'
import { useTrending } from '../hooks/useTrending'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { Lock } from 'lucide-react'
import { VOD_SORTS, setPlaybackPrefs, usePlaybackPrefs, type VodSort } from '../services/playbackPrefs'

const SORT_ICONS: Record<VodSort, React.ReactNode> = {
  source: <ListOrdered className="size-4" />,
  trending: <Flame className="size-4" />,
  recent: <CalendarPlus className="size-4" />,
  title: <ArrowDownAZ className="size-4" />,
  rating: <Star className="size-4" />,
}

const VodView: React.FC<{ type: 'movie' | 'series' }> = ({ type }) => {
  const allItems = useIptvStore((s) => (type === 'movie' ? s.vodMovies : s.vodSeries))
  const { visible: items, hidden: lockedItems } = useVisibleVod(allItems)
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const [category, setCategory] = useState('ALL')
  const [query, setQuery] = useState('')
  // Tri mémorisé (Réglages › Lecture) ; s'il est indisponible ici (pas de tendances, pas de dates d'ajout),
  // on affiche l'ordre du fournisseur sans oublier le choix enregistré
  const savedSort = usePlaybackPrefs().vodSort
  const setSort = (vodSort: VodSort) => setPlaybackPrefs({ vodSort })
  const trending = useTrending(type === 'movie' ? 'movie' : 'tv', items)
  const trendRank = useMemo(() => new Map(trending.matches.map((m) => [m.item.id, m.rank])), [trending.matches])
  const hasAddedDates = useMemo(() => items.some((it) => it.addedAt), [items])
  const sorts = VOD_SORTS.filter((s) => (s.id !== 'trending' || trendRank.size > 0) && (s.id !== 'recent' || hasAddedDates))
  const sort: VodSort = sorts.some((s) => s.id === savedSort) ? savedSort : 'source'

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of items) counts.set(it.category, (counts.get(it.category) || 0) + 1)
    return Array.from(counts.entries())
  }, [items])

  // Dernier point de reprise par titre (les épisodes sont stockés sous « idSérie_ep_idÉpisode »)
  const latestResume = useMemo(() => {
    const map = new Map<string, VodResumePoint>()
    for (const point of Object.values(vodResumePoints)) {
      const itemId = point.id.split('_ep_')[0]
      const prev = map.get(itemId)
      if (!prev || point.updatedAt > prev.updatedAt) map.set(itemId, point)
    }
    return map
  }, [vodResumePoints])

  const progressOf = (item: VodItem) => {
    const point = latestResume.get(item.id)
    return point?.duration ? (point.currentTime / point.duration) * 100 : undefined
  }

  const resumeRow = useMemo(
    () =>
      items
        .filter((it) => latestResume.has(it.id))
        .sort((a, b) => latestResume.get(b.id)!.updatedAt - latestResume.get(a.id)!.updatedAt)
        .slice(0, 20),
    [items, latestResume]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = items.filter((it) => {
      if (category !== 'ALL' && it.category !== category) return false
      if (q) return it.cleanTitle.toLowerCase().includes(q) || it.name.toLowerCase().includes(q)
      return true
    })
    if (sort === 'title') result = [...result].sort((a, b) => a.cleanTitle.localeCompare(b.cleanTitle, 'fr'))
    if (sort === 'rating') result = [...result].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    if (sort === 'recent') result = [...result].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    // Tendances : les titres tendance d'abord (dans l'ordre TMDB), puis le reste du catalogue
    if (sort === 'trending') result = [...result].sort((a, b) => (trendRank.get(a.id) ?? 1e6) - (trendRank.get(b.id) ?? 1e6))
    return result
  }, [items, category, query, sort, trendRank])

  const noun = type === 'movie' ? 'film' : 'série'

  if (items.length === 0) {
    return (
      <div className="px-[var(--gutter)] py-24">
        <h1 className="mt-2 font-xwide text-4xl font-extrabold tracking-tight">Aucun{type === 'series' ? 'e' : ''} {noun} dans votre source</h1>
        <p className="mt-3 max-w-lg text-mist">
          Votre abonnement ne fournit pas de catalogue {type === 'movie' ? 'de films' : 'de séries'}, ou votre playlist M3U ne contient que des chaînes en direct.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-16">
      <header className="flex flex-wrap items-end gap-4 px-[var(--gutter)] pb-5 pt-6 md:pt-10">
        <div className="mr-auto">
          <h1 className="font-xwide text-4xl font-extrabold tracking-tight md:text-5xl">
            {type === 'movie' ? 'Films' : 'Séries'}
            <span className="ml-4 align-middle font-mono text-base font-medium text-fog tabular">{items.length.toLocaleString('fr-FR')} titres</span>
          </h1>
        </div>
        <label className="relative flex w-full items-center sm:w-80">
          <Search className="pointer-events-none absolute left-4 size-4 text-fog" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Rechercher un${type === 'series' ? 'e' : ''} ${noun}`}
            className="h-11 w-full rounded-xl bg-ink-850 pl-11 pr-10 text-paper placeholder:text-fog ring-1 ring-white/6 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {query && (
            <button type="button" aria-label="Effacer" onClick={() => setQuery('')} className="absolute right-2 rounded-lg p-1.5 text-fog hover:text-paper">
              <X className="size-4" />
            </button>
          )}
        </label>
      </header>

      {resumeRow.length > 0 && !query && category === 'ALL' && (
        <div className="mb-8">
          <Row title="Reprendre">
            {resumeRow.map((it) => (
              <PosterCard key={it.id} item={it} progress={progressOf(it)} onOpen={openVodDetail} />
            ))}
          </Row>
        </div>
      )}

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-[var(--gutter)] pb-3">
        <Chip selected={category === 'ALL'} count={items.length} onClick={() => setCategory('ALL')}>
          Tout
        </Chip>
        {categories.map(([cat, count]) => (
          <Chip key={cat} selected={category === cat} count={count} onClick={() => setCategory(cat)}>
            {categoryLabel(cat)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-[var(--gutter)] pb-6">
        {sorts.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            aria-pressed={sort === s.id}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
              sort === s.id ? 'text-accent' : 'text-fog hover:text-paper'
            }`}
          >
            {SORT_ICONS[s.id]}
            {s.label}
          </button>
        ))}
        {lockedItems.length > 0 && (
          <button
            type="button"
            onClick={() => openVodDetail(lockedItems[0])}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-fog hover:text-paper"
          >
            <Lock className="size-4" /> {lockedItems.length.toLocaleString('fr-FR')} titres verrouillés
          </button>
        )}
        <span className="ml-auto font-mono text-sm text-fog tabular">{filtered.length.toLocaleString('fr-FR')} résultats</span>
      </div>

      <div className="px-[var(--gutter)]">
        {filtered.length > 0 ? (
          <PosterGrid items={filtered} progressOf={progressOf} onOpen={openVodDetail} resetKey={`${category}|${query}|${sort}`} />
        ) : (
          <p className="py-16 text-center text-mist">Aucun titre ne correspond. Essayez un autre mot ou un autre genre.</p>
        )}
      </div>
    </div>
  )
}

export default VodView
