import React, { useMemo } from 'react'
import { Sparkles, UserRound } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { Channel, VodItem } from '../types/iptv'
import { useTrending } from '../hooks/useTrending'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { useNow } from '../hooks/useNow'
import { recentlyAdded, topRated } from '../services/trendingService'
import { categoryLabel, categoryUniverse, channelCategory } from '../services/categoryService'
import { BrandWordmark } from '../ui/Brand'
import { ChannelLogo } from '../ui/ChannelLogo'
import { programProgress } from '../ui/Program'
import { Artwork, BarButton, Poster, SectionTitle, TopTen, TrailProgress, Wall, metaLine, openDetail, type WallEntry } from './parts'
import { goToCatalog } from './mobileNav'

const ROW = 18

/** « Ce matin », « Cet après-midi », « Ce soir », « Cette nuit » : l'accueil parle de maintenant. */
function momentOfDay(date: Date): string {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Ce matin'
  if (h >= 12 && h < 18) return 'Cet après-midi'
  if (h >= 18 && h < 23) return 'Ce soir'
  return 'Cette nuit'
}

// Formes des murs de collection, en alternance : deux genres voisins ne se ressemblent jamais
const SHAPES = [
  { shape: 'lead', flip: false },
  { shape: 'wide', flip: false },
  { shape: 'quad', flip: false },
  { shape: 'lead', flip: true },
] as const

/** Carte « Reprendre » : image en paysage, temps restant, traînée de progression. */
const ResumeCard: React.FC<{ item: VodItem; progress: number; remaining?: number; episode?: string }> = ({ item, progress, remaining, episode }) => (
  <button
    type="button"
    onClick={(e) => openDetail(item, e.currentTarget.querySelector<HTMLElement>('[data-art]'))}
    className="m-press w-[15.5rem] shrink-0 text-left"
    aria-label={`Reprendre ${item.cleanTitle}`}
  >
    <div data-art className="relative overflow-hidden rounded-[0.9rem]">
      <Artwork sources={[item.backdrop, item.logo]} title={item.cleanTitle} className="aspect-video" imgClassName={item.backdrop ? '' : 'object-top'} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/95 to-transparent px-3 pb-2.5 pt-8">
        <TrailProgress value={progress} />
      </div>
    </div>
    <p className="mt-2 truncate text-[0.86rem] font-semibold text-paper">{item.cleanTitle}</p>
    <p className="truncate text-[0.76rem] text-fog">
      {[episode, remaining && remaining > 60 ? `${Math.round(remaining / 60)} min restantes` : null].filter(Boolean).join(' · ') || metaLine(item)}
    </p>
  </button>
)

/** Carte du direct : la chaîne, ce qui passe, et où en est l'émission. */
const LiveCard: React.FC<{ channel: Channel; now: number }> = ({ channel, now }) => {
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const program = channel.currentProgram
  return (
    <button
      type="button"
      onClick={() => setActiveChannel(channel)}
      className="m-press flex w-[15.5rem] shrink-0 items-center gap-3 rounded-[1rem] bg-white/[0.055] p-2.5 pr-3 text-left ring-1 ring-white/[0.06]"
    >
      <ChannelLogo logo={channel.logo} name={channel.name} className="size-12 shrink-0 rounded-[0.7rem]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[0.74rem] font-semibold text-mist">
          <span className="size-1.5 shrink-0 rounded-full bg-onair" aria-hidden="true" />
          <span className="truncate">{channel.name}</span>
        </p>
        <p className="mt-0.5 truncate text-[0.88rem] font-semibold text-paper">{program?.title || categoryLabel(channelCategory(channel))}</p>
        {program && (
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-onair" style={{ width: `${programProgress(program, now)}%` }} />
          </div>
        )}
      </div>
    </button>
  )
}

export const MobileHome: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const favorites = useIptvStore((s) => s.favorites)
  const recentlyWatched = useIptvStore((s) => s.recentlyWatched)
  const vodMovies = useVisibleVod(useIptvStore((s) => s.vodMovies)).visible
  const vodSeries = useVisibleVod(useIptvStore((s) => s.vodSeries)).visible
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const now = useNow()

  const trendingMovies = useTrending('movie', vodMovies)
  const trendingSeries = useTrending('tv', vodSeries)

  // Top 10 des films (des séries si l'abonnement n'a pas de films) : tendances TMDB, sinon les mieux notés.
  // Ses trois premiers forment le mur d'ouverture, rangs réels imprimés ; la rangée en dessous continue de 4 à 10.
  const leadType: 'movie' | 'series' = vodMovies.length > 0 ? 'movie' : 'series'
  const leadTrending = leadType === 'movie' ? trendingMovies : trendingSeries
  const leadPool = leadType === 'movie' ? vodMovies : vodSeries
  const topIsTrending = leadTrending.matches.length >= 5
  const leadTop = useMemo<WallEntry[]>(
    () =>
      topIsTrending
        ? leadTrending.matches.slice(0, 10).map((m, i) => ({ item: m.item, poster: m.entry.poster, backdrop: m.entry.backdrop, rank: i + 1 }))
        : topRated(leadPool, 10).map((item, i) => ({ item, rank: i + 1 })),
    [topIsTrending, leadTrending.matches, leadPool]
  )
  const opening = leadTop.length >= 3 ? leadTop.slice(0, 3) : recentlyAdded(leadPool, 3).map((item) => ({ item }))
  const podium = leadTop.length >= 3

  const resumeItems = useMemo(() => {
    const byId = new Map([...vodMovies, ...vodSeries].map((v) => [v.id, v]))
    const seen = new Set<string>()
    return Object.values(vodResumePoints)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .flatMap((p) => {
        const [baseId] = p.id.split('_ep_')
        const item = byId.get(p.id) || byId.get(baseId)
        if (!item || seen.has(item.id)) return []
        seen.add(item.id)
        return [{ item, progress: p.duration ? (p.currentTime / p.duration) * 100 : 0, remaining: p.duration - p.currentTime, isEpisode: p.id.includes('_ep_') }]
      })
      .slice(0, ROW)
  }, [vodMovies, vodSeries, vodResumePoints])

  // Le Top 10 des séries a sa propre rangée plus bas (quand le mur d'ouverture est celui des films)
  const topSeries = useMemo(
    () => (trendingSeries.matches.length >= 5 ? trendingSeries.matches.map((m) => ({ item: m.item, poster: m.entry.poster })) : topRated(vodSeries, 10).map((item) => ({ item }))),
    [trendingSeries.matches, vodSeries]
  )

  // Collections : les genres les plus fournis du catalogue de films, chacun en mur d'une forme différente
  const collections = useMemo(() => {
    const groups = new Map<string, VodItem[]>()
    for (const m of vodMovies) {
      const list = groups.get(m.category)
      if (list) list.push(m)
      else groups.set(m.category, [m])
    }
    return Array.from(groups.entries())
      .filter(([, list]) => list.length >= 6)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4)
      .map(([category, list]) => ({ category, items: topRated(list, 4).length >= 4 ? topRated(list, 4) : list.slice(0, 4), all: list }))
  }, [vodMovies])

  const recentMovies = useMemo(() => recentlyAdded(vodMovies, ROW), [vodMovies])
  const recentSeries = useMemo(() => recentlyAdded(vodSeries, ROW), [vodSeries])

  // Direct maintenant : chaînes récentes et favorites d'abord, puis la France avec un programme connu
  const liveNow = useMemo(() => {
    const byId = new Map(channels.map((c) => [c.id, c]))
    const favs = new Set(favorites)
    const mine = [...recentlyWatched.map((c) => byId.get(c.id)), ...channels.filter((c) => favs.has(c.id))].filter((c): c is Channel => !!c)
    const rest = channels.filter((c) => c.currentProgram && categoryUniverse(channelCategory(c)) === 'france')
    const seen = new Set<string>()
    return [...mine, ...rest].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, ROW)
  }, [channels, favorites, recentlyWatched])

  const stats = [
    vodMovies.length ? `${vodMovies.length.toLocaleString('fr-FR')} films` : null,
    vodSeries.length ? `${vodSeries.length.toLocaleString('fr-FR')} séries` : null,
    channels.length ? `${channels.length.toLocaleString('fr-FR')} chaînes` : null,
  ].filter(Boolean)

  const hasVod = vodMovies.length + vodSeries.length > 0

  return (
    <div className="pb-[calc(var(--m-tabbar)+2rem)]">
      <header className="relative isolate px-[var(--m-gutter)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        {/* La nuit du logo, plus claire sous le titre : le fond a de la profondeur sans décor */}
        <div aria-hidden="true" className="absolute inset-x-0 -top-10 -z-10 h-[26rem] bg-[radial-gradient(90%_70%_at_30%_20%,var(--color-ink-800),transparent_70%)] opacity-70" />
        <div className="flex h-11 items-center justify-between">
          <BrandWordmark className="h-9" />
          <BarButton label="Ma liste et réglages" onClick={() => setCurrentView('favorites')}>
            <UserRound className="size-5" />
          </BarButton>
        </div>
        <h1 className="m-display mt-5 text-[3.25rem] text-paper">{momentOfDay(new Date(now))}</h1>
        <p className="mt-2 text-[0.92rem] font-semibold text-paper">
          {podium
            ? topIsTrending
              ? `Le podium des ${leadType === 'movie' ? 'films' : 'séries'} : tendances TMDB de la semaine, dans votre abonnement`
              : `Le podium des ${leadType === 'movie' ? 'films' : 'séries'} les mieux notés de votre abonnement`
            : hasVod
              ? 'Les derniers ajouts de votre abonnement'
              : 'Votre abonnement en direct'}
        </p>
        {stats.length > 0 && <p className="mt-0.5 text-[0.82rem] text-fog">{stats.join(' · ')}</p>}
      </header>

      {hasVod ? (
        <section className="mt-6" aria-label={podium ? 'Podium' : 'Derniers ajouts'}>
          <Wall entries={opening} eager />
        </section>
      ) : (
        liveNow.length > 0 && (
          <section className="mt-6">
            <div className="m-rail gap-2.5">
              {liveNow.map((c) => (
                <LiveCard key={c.id} channel={c} now={now} />
              ))}
            </div>
          </section>
        )
      )}

      {resumeItems.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Reprendre" />
          <div className="m-rail mt-3.5 gap-3">
            {resumeItems.map((r) => (
              <ResumeCard key={r.item.id} item={r.item} progress={r.progress} remaining={r.remaining} episode={r.isEpisode ? 'Épisode en cours' : undefined} />
            ))}
          </div>
        </section>
      )}

      {podium && leadTop.length > 3 && (
        <section className="mt-11">
          <SectionTitle
            title={`La suite du Top 10 des ${leadType === 'movie' ? 'films' : 'séries'}`}
            detail={topIsTrending ? 'Tendances TMDB de la semaine, dans votre abonnement' : 'Les mieux notés de votre abonnement'}
            onMore={() => goToCatalog(leadType)}
          />
          <div className="mt-3">
            <TopTen items={leadTop.slice(3)} />
          </div>
        </section>
      )}

      {hasVod && !trendingMovies.enabled && (
        <section className="mt-10 px-[var(--m-gutter)]">
          <button
            type="button"
            onClick={() => setCurrentView('settings')}
            className="m-press flex w-full items-center gap-4 rounded-[1.15rem] bg-white/[0.055] p-4 text-left ring-1 ring-white/[0.06]"
          >
            <Sparkles className="size-6 shrink-0 text-paper" />
            <span className="min-w-0">
              <span className="block text-[0.95rem] font-semibold text-paper">Afficher les tendances de la semaine</span>
              <span className="mt-0.5 block text-[0.8rem] leading-snug text-mist">Une clé TMDB gratuite suffit : réglages, rubrique Tendances.</span>
            </span>
          </button>
        </section>
      )}

      {liveNow.length > 0 && hasVod && (
        <section className="mt-11">
          <SectionTitle title="En direct maintenant" onMore={() => setCurrentView('live')} />
          <div className="m-rail mt-3.5 gap-2.5">
            {liveNow.map((c) => (
              <LiveCard key={c.id} channel={c} now={now} />
            ))}
          </div>
        </section>
      )}

      {collections.map((col, i) => (
        <section key={col.category} className="mt-12">
          <SectionTitle
            title={categoryLabel(col.category)}
            detail={`${col.all.length.toLocaleString('fr-FR')} films`}
            onMore={() => goToCatalog('movie', col.category)}
          />
          <div className="mt-3.5">
            <Wall entries={col.items.map((item) => ({ item }))} shape={SHAPES[i % SHAPES.length].shape} flip={SHAPES[i % SHAPES.length].flip} />
          </div>
          {col.all.length > col.items.length && (
            <div className="m-rail mt-3 gap-2.5">
              {col.all
                .filter((m) => !col.items.includes(m))
                .slice(0, ROW)
                .map((m) => (
                  <Poster key={m.id} item={m} />
                ))}
            </div>
          )}
        </section>
      ))}

      {recentMovies.length > 0 && (
        <section className="mt-12">
          <SectionTitle title="Films ajoutés récemment" onMore={() => goToCatalog('movie')} />
          <div className="m-rail mt-3.5 gap-2.5">
            {recentMovies.map((m) => (
              <Poster key={m.id} item={m} />
            ))}
          </div>
        </section>
      )}

      {leadType === 'movie' && topSeries.length >= 3 && (
        <section className="mt-12">
          <SectionTitle
            title={trendingSeries.matches.length >= 5 ? 'Top 10 des séries cette semaine' : 'Top 10 des séries'}
            onMore={() => goToCatalog('series')}
          />
          <div className="mt-3">
            <TopTen items={topSeries} />
          </div>
        </section>
      )}

      {recentSeries.length > 0 && (
        <section className="mt-12">
          <SectionTitle title="Séries ajoutées récemment" onMore={() => goToCatalog('series')} />
          <div className="m-rail mt-3.5 gap-2.5">
            {recentSeries.map((m) => (
              <Poster key={m.id} item={m} />
            ))}
          </div>
        </section>
      )}

      {!hasVod && channels.length === 0 && (
        <section className="px-[var(--m-gutter)] py-16">
          <h2 className="m-heading text-2xl">Votre source est vide</h2>
          <p className="mt-2 text-mist">Aucune chaîne ni aucun film n’a été trouvé. Vérifiez l’abonnement ou changez de source dans les réglages.</p>
        </section>
      )}
    </div>
  )
}

export default MobileHome
