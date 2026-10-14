import React, { useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { useNow } from '../hooks/useNow'
import { Row } from '../components/Row'
import { ChannelTile } from '../components/ChannelTile'
import { PosterCard } from '../components/PosterCard'
import { useVisibleVod } from '../hooks/useParentalFilter'

const MAX_RESULTS = 40

// Recherche insensible aux accents et à la casse
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
      if (out.length >= MAX_RESULTS) break
    }
  }
  return out
}

const SearchView: React.FC = () => {
  const query = useIptvStore((s) => s.searchQuery)
  const setSearchQuery = useIptvStore((s) => s.setSearchQuery)
  const channels = useIptvStore((s) => s.channels)
  const vodMovies = useVisibleVod(useIptvStore((s) => s.vodMovies)).visible
  const vodSeries = useVisibleVod(useIptvStore((s) => s.vodSeries)).visible
  const favorites = useIptvStore((s) => s.favorites)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const now = useNow()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const deferred = useDeferredValue(query)

  // Sur TV, focaliser le champ ouvrirait le clavier à l'écran sans que l'utilisateur l'ait demandé
  useEffect(() => {
    if (document.documentElement.dataset.device !== 'tv') inputRef.current?.focus()
  }, [])

  // Titres normalisés une fois par catalogue : la frappe reste fluide même avec des dizaines de milliers de titres
  const movieIndex = useMemo(() => vodMovies.map((m) => [normalize(m.cleanTitle), m] as const), [vodMovies])
  const seriesIndex = useMemo(() => vodSeries.map((m) => [normalize(m.cleanTitle), m] as const), [vodSeries])
  const channelIndex = useMemo(() => channels.map((c) => [normalize(c.name), c] as const), [channels])
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const results = useMemo(() => {
    const q = normalize(deferred.trim())
    if (q.length < 2) return null
    const asNumber = /^\d+$/.test(q) ? parseInt(q, 10) : null
    return {
      channels: channelIndex
        .filter(([name, c]) => (asNumber !== null && c.number === asNumber) || name.includes(q) || (c.currentProgram && normalize(c.currentProgram.title).includes(q)))
        .slice(0, MAX_RESULTS)
        .map(([, c]) => c),
      movies: pick(movieIndex, q),
      series: pick(seriesIndex, q),
    }
  }, [deferred, channelIndex, movieIndex, seriesIndex])

  const total = results ? results.channels.length + results.movies.length + results.series.length : 0

  return (
    <div className="pb-16 pt-6 md:pt-10">
      <div className="px-[var(--gutter)]">
        <h1 className="font-xwide text-4xl font-extrabold tracking-tight md:text-5xl">Rechercher</h1>
        <label className="relative mt-4 flex max-w-3xl items-center">
          <Search className="pointer-events-none absolute left-5 size-6 text-fog" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Chaîne, émission, film, série…"
            className="h-16 w-full rounded-2xl bg-ink-850 pl-16 pr-14 font-wide text-2xl font-bold text-paper placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:text-fog ring-1 ring-white/8 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {query && (
            <button type="button" aria-label="Effacer" onClick={() => setSearchQuery('')} className="absolute right-3 rounded-xl p-2.5 text-fog hover:text-paper">
              <X className="size-5" />
            </button>
          )}
        </label>
        <p className="mt-3 text-sm text-fog">
          {results ? `${total} résultat${total > 1 ? 's' : ''}` : 'Tapez au moins deux lettres, ou un numéro de chaîne.'}
        </p>
      </div>

      {results && (
        <div className="mt-10 space-y-12">
          {results.channels.length > 0 && (
            <Row title="Chaînes" meta={results.channels.length}>
              {results.channels.map((c) => (
                <ChannelTile key={c.id} channel={c} now={now} isFavorite={favoriteSet.has(c.id)} onPlay={setActiveChannel} />
              ))}
            </Row>
          )}
          {results.movies.length > 0 && (
            <Row title="Films" meta={results.movies.length}>
              {results.movies.map((m) => (
                <PosterCard key={m.id} item={m} onOpen={openVodDetail} />
              ))}
            </Row>
          )}
          {results.series.length > 0 && (
            <Row title="Séries" meta={results.series.length}>
              {results.series.map((s) => (
                <PosterCard key={s.id} item={s} onOpen={openVodDetail} />
              ))}
            </Row>
          )}
          {total === 0 && (
            <p className="px-[var(--gutter)] text-mist">Rien ne correspond à « {deferred} ». Vérifiez l’orthographe ou essayez un mot plus court.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default SearchView
