import React, { useDeferredValue, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { Channel, VodItem } from '../types/iptv'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { categoryLabel } from '../services/categoryService'
import { ChannelLogo } from '../ui/ChannelLogo'
import { Poster, SectionTitle, useScrolledPast } from './parts'
import { goToCatalog } from './mobileNav'

const MAX = 30

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function pick<T>(index: readonly (readonly [string, T])[], q: string): T[] {
  const out: T[] = []
  for (const [title, item] of index) {
    if (title.includes(q)) {
      out.push(item)
      if (out.length >= MAX) break
    }
  }
  return out
}

/** Tuile de genre : nom en capitales Montserrat, comme un titre d'affiche, et nombre de titres. */
const GenreTile: React.FC<{ label: string; count: number; onOpen: () => void }> = ({ label, count, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="m-press relative h-[5.5rem] overflow-hidden rounded-[1rem] bg-[linear-gradient(150deg,var(--color-ink-800),var(--color-ink-900)_85%)] p-3 text-left ring-1 ring-white/[0.06]"
  >
    <span className="m-display block text-[1.05rem] uppercase text-paper line-clamp-2">{label}</span>
    <span className="absolute bottom-2.5 left-3 font-mono text-[0.72rem] text-fog tabular">{count.toLocaleString('fr-FR')} titre{count > 1 ? 's' : ''}</span>
  </button>
)

const MobileSearch: React.FC = () => {
  const query = useIptvStore((s) => s.searchQuery)
  const setSearchQuery = useIptvStore((s) => s.setSearchQuery)
  const channels = useIptvStore((s) => s.channels)
  const vodMovies = useVisibleVod(useIptvStore((s) => s.vodMovies)).visible
  const vodSeries = useVisibleVod(useIptvStore((s) => s.vodSeries)).visible
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const deferred = useDeferredValue(query)
  const compact = useScrolledPast(40)

  const movieIndex = useMemo(() => vodMovies.map((m) => [normalize(m.cleanTitle), m] as const), [vodMovies])
  const seriesIndex = useMemo(() => vodSeries.map((m) => [normalize(m.cleanTitle), m] as const), [vodSeries])
  const channelIndex = useMemo(() => channels.map((c) => [normalize(c.name), c] as const), [channels])

  const results = useMemo(() => {
    const q = normalize(deferred.trim())
    if (q.length < 2) return null
    const asNumber = /^\d+$/.test(q) ? parseInt(q, 10) : null
    return {
      channels: channelIndex
        .filter(([name, c]) => (asNumber !== null && c.number === asNumber) || name.includes(q) || (c.currentProgram && normalize(c.currentProgram.title).includes(q)))
        .slice(0, MAX)
        .map(([, c]) => c),
      movies: pick(movieIndex, q),
      series: pick(seriesIndex, q),
    }
  }, [deferred, channelIndex, movieIndex, seriesIndex])

  // Sans recherche : les genres du catalogue, les plus fournis d'abord
  const genres = useMemo(() => {
    const count = (list: VodItem[]) => {
      const m = new Map<string, number>()
      for (const it of list) m.set(it.category, (m.get(it.category) || 0) + 1)
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    }
    return { movies: count(vodMovies).slice(0, 12), series: count(vodSeries).slice(0, 8) }
  }, [vodMovies, vodSeries])

  const total = results ? results.channels.length + results.movies.length + results.series.length : 0

  return (
    <div className="pb-[calc(var(--m-tabbar)+2rem)]">
      <div className={`sticky top-0 z-30 px-[var(--m-gutter)] pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] transition-colors ${compact ? 'm-bar' : ''}`}>
        <h1 className={`m-display origin-left text-paper transition-[font-size] duration-300 ${compact ? 'text-[1.4rem]' : 'mt-11 text-[2.6rem]'}`}>Rechercher</h1>
        <label className="relative mt-3 flex items-center">
          <Search className="pointer-events-none absolute left-3.5 size-[1.15rem] text-fog" />
          <input
            value={query}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Film, série, chaîne, émission…"
            className="h-12 w-full rounded-[0.85rem] bg-white/[0.09] pl-11 pr-11 text-[1rem] text-paper placeholder:text-fog focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {query && (
            <button type="button" aria-label="Effacer" onClick={() => setSearchQuery('')} className="absolute right-1.5 rounded-full p-2.5 text-fog">
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      {!results && (
        <div className="mt-4 space-y-9">
          {genres.movies.length > 0 && (
            <section>
              <SectionTitle title="Genres de films" />
              <div className="mt-3 grid grid-cols-2 gap-2.5 px-[var(--m-gutter)]">
                {genres.movies.map(([cat, n]) => (
                  <GenreTile key={cat} label={categoryLabel(cat)} count={n} onOpen={() => goToCatalog('movie', cat)} />
                ))}
              </div>
            </section>
          )}
          {genres.series.length > 0 && (
            <section>
              <SectionTitle title="Genres de séries" />
              <div className="mt-3 grid grid-cols-2 gap-2.5 px-[var(--m-gutter)]">
                {genres.series.map(([cat, n]) => (
                  <GenreTile key={cat} label={categoryLabel(cat)} count={n} onOpen={() => goToCatalog('series', cat)} />
                ))}
              </div>
            </section>
          )}
          {genres.movies.length + genres.series.length === 0 && (
            <p className="px-[var(--m-gutter)] text-mist">Tapez au moins deux lettres, ou un numéro de chaîne.</p>
          )}
        </div>
      )}

      {results && (
        <div className="mt-3 space-y-9">
          <p className="px-[var(--m-gutter)] text-[0.85rem] text-fog">
            {total ? `${total} résultat${total > 1 ? 's' : ''}` : `Rien ne correspond à « ${deferred} ». Vérifiez l’orthographe ou essayez un mot plus court.`}
          </p>
          {results.movies.length > 0 && (
            <section>
              <SectionTitle title="Films" detail={`${results.movies.length} titre${results.movies.length > 1 ? "s" : ""}`} />
              <div className="m-rail mt-3 gap-2.5">
                {results.movies.map((m) => (
                  <Poster key={m.id} item={m} />
                ))}
              </div>
            </section>
          )}
          {results.series.length > 0 && (
            <section>
              <SectionTitle title="Séries" detail={`${results.series.length} titre${results.series.length > 1 ? "s" : ""}`} />
              <div className="m-rail mt-3 gap-2.5">
                {results.series.map((m) => (
                  <Poster key={m.id} item={m} />
                ))}
              </div>
            </section>
          )}
          {results.channels.length > 0 && (
            <section>
              <SectionTitle title="Chaînes" detail={`${results.channels.length} chaîne${results.channels.length > 1 ? "s" : ""}`} />
              <ul className="mt-2">
                {results.channels.map((c: Channel) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setActiveChannel(c)} className="m-press flex w-full items-center gap-3 px-[var(--m-gutter)] py-2 text-left">
                      <ChannelLogo logo={c.logo} name={c.name} className="size-11 shrink-0 rounded-[0.7rem]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.95rem] font-semibold">{c.name}</span>
                        <span className="block truncate text-[0.8rem] text-mist">{c.currentProgram?.title || categoryLabel(c.category)}</span>
                      </span>
                      {c.number && <span className="font-mono text-[0.78rem] text-fog tabular">{c.number}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default MobileSearch
