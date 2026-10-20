import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownWideNarrow, Lock, Search, X } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { VodItem, VodResumePoint } from '../types/iptv'
import { useTrending } from '../hooks/useTrending'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { categoryLabel } from '../services/categoryService'
import { recentlyAdded, topRated } from '../services/trendingService'
import { LargeTitle, Pills, Poster, SectionTitle, TopTen, Wall, useScrolledPast } from './parts'
import { takePendingGenre } from './mobileNav'

type Sort = 'source' | 'trending' | 'recent' | 'title' | 'rating'

const SORT_LABELS: Record<Sort, string> = {
  source: 'Ordre du fournisseur',
  trending: 'Tendances',
  recent: 'Ajoutés récemment',
  title: 'A → Z',
  rating: 'Mieux notés',
}
// Libellé court du bouton (le menu garde le libellé complet)
const SORT_SHORT: Record<Sort, string> = { source: 'Par défaut', trending: 'Tendances', recent: 'Récents', title: 'A → Z', rating: 'Mieux notés' }

const PAGE = 45

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Grille de trois affiches qui se remplit au fil du défilement : fluide même avec des milliers de titres.
 * Un nouveau filtre remonte la grille (clé), qui repart de la première page.
 */
const ProgressiveGrid: React.FC<{ items: VodItem[]; progressOf: (item: VodItem) => number | undefined }> = ({ items, progressOf }) => {
  const [count, setCount] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => c + PAGE)
    }, { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, count])

  return (
    <>
      <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 px-[var(--m-gutter)] phone-landscape:grid-cols-6">
        {items.slice(0, count).map((it) => (
          <Poster key={it.id} item={it} progress={progressOf(it)} className="w-full" />
        ))}
      </div>
      {count < items.length && <div ref={sentinel} className="h-10" aria-hidden="true" />}
    </>
  )
}

const MobileCatalog: React.FC<{ type: 'movie' | 'series' }> = ({ type }) => {
  const allItems = useIptvStore((s) => (type === 'movie' ? s.vodMovies : s.vodSeries))
  const { visible: items, hidden: lockedItems } = useVisibleVod(allItems)
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const [category, setCategory] = useState<string>(() => takePendingGenre(type) ?? 'ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('source')
  const [sortOpen, setSortOpen] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const pinned = useScrolledPast(150)

  const trending = useTrending(type === 'movie' ? 'movie' : 'tv', items)
  const trendRank = useMemo(() => new Map(trending.matches.map((m) => [m.item.id, m.rank])), [trending.matches])
  const hasAddedDates = useMemo(() => items.some((it) => it.addedAt), [items])
  const sorts = (Object.keys(SORT_LABELS) as Sort[]).filter((s) => (s !== 'trending' || trendRank.size > 0) && (s !== 'recent' || hasAddedDates))

  const genres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of items) counts.set(it.category, (counts.get(it.category) || 0) + 1)
    return [{ id: 'ALL', label: 'Tout', count: items.length }, ...Array.from(counts.entries()).map(([id, count]) => ({ id, label: categoryLabel(id), count }))]
  }, [items])

  const latestResume = useMemo(() => {
    const map = new Map<string, VodResumePoint>()
    for (const point of Object.values(vodResumePoints)) {
      const id = point.id.split('_ep_')[0]
      const prev = map.get(id)
      if (!prev || point.updatedAt > prev.updatedAt) map.set(id, point)
    }
    return map
  }, [vodResumePoints])
  const progressOf = (item: VodItem) => {
    const p = latestResume.get(item.id)
    return p?.duration ? (p.currentTime / p.duration) * 100 : undefined
  }

  const inGenre = useMemo(() => (category === 'ALL' ? items : items.filter((it) => it.category === category)), [items, category])

  const filtered = useMemo(() => {
    const q = normalize(deferredQuery.trim())
    let result = q ? inGenre.filter((it) => normalize(it.cleanTitle).includes(q)) : inGenre
    if (sort === 'title') result = [...result].sort((a, b) => a.cleanTitle.localeCompare(b.cleanTitle, 'fr'))
    if (sort === 'rating') result = [...result].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    if (sort === 'recent') result = [...result].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    if (sort === 'trending') result = [...result].sort((a, b) => (trendRank.get(a.id) ?? 1e6) - (trendRank.get(b.id) ?? 1e6))
    return result
  }, [inGenre, deferredQuery, sort, trendRank])

  // En tête du genre : son Top 10 (tendances si disponibles, sinon les mieux notés)
  const top = useMemo(() => {
    const trend = trending.matches.filter((m) => category === 'ALL' || m.item.category === category)
    if (trend.length >= 5) return { trending: true, list: trend.map((m) => ({ item: m.item, poster: m.entry.poster })) }
    return { trending: false, list: topRated(inGenre, 10).map((item) => ({ item })) }
  }, [trending.matches, inGenre, category])

  const resumeRow = useMemo(
    () => inGenre.filter((it) => latestResume.has(it.id)).sort((a, b) => latestResume.get(b.id)!.updatedAt - latestResume.get(a.id)!.updatedAt).slice(0, 18),
    [inGenre, latestResume]
  )
  const fresh = useMemo(() => (hasAddedDates ? recentlyAdded(inGenre, 18) : []), [inGenre, hasAddedDates])

  const title = type === 'movie' ? 'Films' : 'Séries'
  const noun = type === 'movie' ? 'films' : 'séries'
  const browsing = !deferredQuery.trim()

  if (items.length === 0) {
    return (
      <div className="pb-[calc(var(--m-tabbar)+2rem)]">
        <LargeTitle title={title} />
        <p className="mt-6 px-[var(--m-gutter)] text-mist">
          Votre abonnement ne fournit pas de {noun}, ou votre playlist M3U ne contient que des chaînes en direct.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-[calc(var(--m-tabbar)+2rem)]">
      <LargeTitle title={title} detail={`${items.length.toLocaleString('fr-FR')} ${items.length > 1 ? noun : noun.slice(0, -1)} dans votre abonnement`} />

      <label className="relative mx-[var(--m-gutter)] mt-4 flex items-center">
        <Search className="pointer-events-none absolute left-3.5 size-[1.1rem] text-fog" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder={`Rechercher dans les ${noun}`}
          className="h-11 w-full rounded-[0.8rem] bg-white/[0.08] pl-10 pr-10 text-[0.95rem] text-paper placeholder:text-fog focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {query && (
          <button type="button" aria-label="Effacer" onClick={() => setQuery('')} className="absolute right-1.5 rounded-full p-2 text-fog">
            <X className="size-4" />
          </button>
        )}
      </label>

      {/* Genres : restent accrochés sous la barre compacte pendant le défilement */}
      <div className={`sticky top-[calc(2.9rem+env(safe-area-inset-top))] z-20 mt-3 transition-colors ${pinned ? 'm-bar' : ''}`}>
        <Pills ariaLabel="Genres" options={genres} value={category} onChange={(id) => {
          setCategory(id)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }} className="py-2" />
      </div>

      {/* Ouverture du rayon : les trois derniers ajouts en mur (ou les trois premiers du rayon sans dates d'ajout) */}
      {browsing && inGenre.length >= 3 && (
        <section className="mt-5" aria-label="À l’affiche du rayon">
          <Wall entries={(fresh.length >= 3 ? fresh : inGenre).slice(0, 3).map((item) => ({ item }))} flip={type === 'series'} eager />
        </section>
      )}

      {browsing && top.list.length >= 3 && (
        <section className="mt-10">
          <SectionTitle
            title={category === 'ALL' ? `Top 10 des ${noun}` : `Top 10 · ${categoryLabel(category)}`}
            detail={top.trending ? 'Tendances TMDB de la semaine, dans votre abonnement' : 'Les mieux notés de votre abonnement'}
          />
          <div className="mt-3">
            <TopTen items={top.list} />
          </div>
        </section>
      )}

      {browsing && resumeRow.length > 0 && (
        <section className="mt-9">
          <SectionTitle title="Reprendre" />
          <div className="m-rail mt-3 gap-2.5">
            {resumeRow.map((it) => (
              <Poster key={it.id} item={it} progress={progressOf(it)} />
            ))}
          </div>
        </section>
      )}

      {browsing && fresh.length > 3 && sort !== 'recent' && (
        <section className="mt-9">
          <SectionTitle title="Ajoutés récemment" />
          <div className="m-rail mt-3 gap-2.5">
            {fresh.slice(3).map((it) => (
              <Poster key={it.id} item={it} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3 px-[var(--m-gutter)]">
          <h2 className="m-heading min-w-0 truncate text-[1.45rem]">
            {browsing ? (category === 'ALL' ? `${type === 'movie' ? 'Tous les' : 'Toutes les'} ${noun}` : categoryLabel(category)) : `Résultats`}
            <span className="ml-2 align-middle font-mono text-[0.8rem] font-medium text-fog tabular">{filtered.length.toLocaleString('fr-FR')}</span>
          </h2>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              aria-expanded={sortOpen}
              aria-haspopup="menu"
              aria-label={`Trier : ${SORT_LABELS[sort]}`}
              className="m-press flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.07] px-3.5 text-[0.82rem] font-semibold text-mist"
            >
              <ArrowDownWideNarrow className="size-4" /> {SORT_SHORT[sort]}
            </button>
            {sortOpen && (
              <div role="menu" className="m-bar absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-[1rem] py-1.5 ring-1 ring-white/10 shadow-[0_1.5rem_3rem_-1rem_rgb(0_0_0/0.8)] animate-m-fade">
                {sorts.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sort === s}
                    onClick={() => {
                      setSort(s)
                      setSortOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[0.9rem] ${sort === s ? 'font-semibold text-paper' : 'text-mist'}`}
                  >
                    {SORT_LABELS[s]}
                    {sort === s && <span className="size-1.5 rounded-full streak" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4">
          {filtered.length > 0 ? (
            <ProgressiveGrid key={`${category}|${deferredQuery}|${sort}`} items={filtered} progressOf={progressOf} />
          ) : (
            <p className="px-[var(--m-gutter)] py-12 text-center text-mist">Aucun titre ne correspond. Essayez un autre mot ou un autre genre.</p>
          )}
        </div>
        {lockedItems.length > 0 && (
          <button
            type="button"
            onClick={() => openVodDetail(lockedItems[0])}
            className="m-press mx-auto mt-8 flex items-center gap-2 rounded-full px-4 py-2 text-[0.85rem] font-semibold text-fog"
          >
            <Lock className="size-4" /> {lockedItems.length.toLocaleString('fr-FR')} titres verrouillés
          </button>
        )}
      </section>
    </div>
  )
}

export default MobileCatalog
