import React, { useMemo, useState } from 'react'
import { Play, Heart, Radio, Info, Sparkles, Star } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { categoryLabel, categoryUniverse, channelCategory, universeSelection, type Universe } from '../services/categoryService'
import { recentlyAdded, topRated, type TrendingMatch } from '../services/trendingService'
import type { Channel, VodItem } from '../types/iptv'
import { useNow } from '../hooks/useNow'
import { useTrending } from '../hooks/useTrending'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { Row } from '../components/Row'
import { ChannelTile } from '../components/ChannelTile'
import { PosterCard } from '../components/PosterCard'
import { ChannelLogo } from '../ui/ChannelLogo'
import { Button } from '../ui/Button'
import { ChannelNumber, OnAirDot, ProgressLine, formatTime, programProgress } from '../ui/Program'

const ROW_LIMIT = 20

/** Les boîtiers TV affichent en 1080p au mieux : un fond en 780 px de large suffit et pèse trois fois moins. */
function backdropFor(url: string | undefined) {
  if (!url) return undefined
  return document.documentElement.dataset.device === 'tv' ? url.replace('/w1280/', '/w780/') : url
}

/** À la une : le titre le plus regardé de la semaine qui est dans le catalogue de l'abonnement. */
const FeaturedHero: React.FC<{ match: TrendingMatch }> = ({ match }) => {
  const playVod = useIptvStore((s) => s.playVod)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const { item, entry, rank } = match
  const backdrop = backdropFor(entry.backdrop || item.backdrop)
  const [loaded, setLoaded] = useState(false)
  const isMovie = item.type === 'movie'
  const rating = entry.rating || item.rating
  const meta = [isMovie ? 'Film' : 'Série', entry.year || item.year, item.category && categoryLabel(item.category)].filter(Boolean).join(' · ')

  return (
    <section className="relative isolate min-h-[min(36rem,70vh)] overflow-hidden px-[var(--gutter)] pb-10 pt-24 md:pt-36 tv:min-h-[30rem] tv:pt-28">
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 -z-20 size-full object-cover object-[center_20%] transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {/* Fondu vers la nuit du logo : le texte reste lisible sur n'importe quelle image */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--color-ink-950)_8%,rgb(3_9_25/0.82)_42%,rgb(3_9_25/0.2)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />

      <div className="max-w-2xl animate-rise">
        <span className="inline-flex items-center gap-2 rounded-full streak px-3 py-1 font-display text-sm font-extrabold text-ink-950">
          <Sparkles className="size-4" /> N°{rank} des tendances cette semaine
        </span>
        <h1 className="mt-5 font-xwide text-[clamp(2.4rem,5.4vw,4.75rem)] font-extrabold leading-[0.98] text-paper text-balance tv:text-[3.4rem]">
          {entry.title || item.cleanTitle}
        </h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-mist">
          {rating ? (
            <span className="inline-flex items-center gap-1 font-semibold text-paper">
              <Star className="size-4 fill-brand-yellow text-brand-yellow" /> {rating.toFixed(1)}
            </span>
          ) : null}
          <span>{meta}</span>
        </p>
        {(entry.overview || item.overview) && (
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-mist line-clamp-3 tv:line-clamp-2">{entry.overview || item.overview}</p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            data-autofocus
            icon={<Play className="size-5 fill-current" />}
            onClick={() => (isMovie ? playVod(item) : openVodDetail(item))}
          >
            {isMovie ? 'Regarder' : 'Voir les épisodes'}
          </Button>
          <Button size="lg" icon={<Info className="size-5" />} onClick={() => openVodDetail(item)}>
            Plus d’infos
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Sans tendances : la chaîne à reprendre, en grand. */
const ChannelHero: React.FC<{ channel: Channel; label: string; now: number }> = ({ channel, label, now }) => {
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const isFavorite = useIptvStore((s) => s.favorites.includes(channel.id))
  const program = channel.currentProgram

  return (
    <section className="relative isolate overflow-hidden px-[var(--gutter)] pb-10 pt-12 md:pt-24 tv:pt-16">
      <div className="absolute -right-24 -top-[26rem] -z-10 size-[44rem] rounded-full bg-[radial-gradient(closest-side,rgb(155_107_255/0.24),transparent)]" />
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="animate-rise">
          <div className="flex items-center gap-4">
            <OnAirDot />
            <span className="text-sm font-semibold text-mist">{label}</span>
          </div>
          <div className="mt-4 flex items-baseline gap-4">
            <ChannelNumber value={channel.number} className="text-3xl text-accent md:text-4xl" />
            <h1 className="font-xwide text-[clamp(2.2rem,5vw,4.4rem)] font-extrabold leading-[0.98] text-paper tv:text-[3.2rem]">{channel.name}</h1>
          </div>
          {program ? (
            <div className="mt-6 max-w-xl">
              <p className="text-xl font-semibold text-paper md:text-2xl">{program.title}</p>
              <div className="mt-3 flex items-center gap-4">
                <span className="font-mono text-sm text-mist tabular">
                  {formatTime(program.start)} – {formatTime(program.stop)}
                </span>
                <ProgressLine value={programProgress(program, now)} className="h-1.5 max-w-64 flex-1" />
              </div>
            </div>
          ) : (
            <p className="mt-5 text-lg text-mist">{categoryLabel(channelCategory(channel))}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" data-autofocus icon={<Play className="size-5 fill-current" />} onClick={() => setActiveChannel(channel)}>
              Regarder
            </Button>
            <Button size="lg" icon={<Heart className={`size-5 ${isFavorite ? 'fill-accent text-accent' : ''}`} />} onClick={() => toggleFavorite(channel.id)}>
              {isFavorite ? 'Dans vos favoris' : 'Ajouter aux favoris'}
            </Button>
          </div>
        </div>
        <div className="relative hidden aspect-video overflow-hidden rounded-[1.75rem] bg-ink-900 ring-1 ring-white/8 shadow-[0_2rem_5rem_-2rem_rgb(0_0_0/0.9)] md:block">
          <ChannelLogo logo={channel.logo} name={channel.name} className="absolute inset-0 m-auto size-[46%] bg-transparent" />
          <div className="streak absolute inset-x-0 bottom-0 h-1.5" />
        </div>
      </div>
    </section>
  )
}

/** Invitation à activer les tendances (clé TMDB gratuite). */
const TrendingInvite: React.FC = () => {
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  return (
    <section className="px-[var(--gutter)]">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl bg-ink-900 px-6 py-5 ring-1 ring-white/6">
        <Sparkles className="size-7 shrink-0 text-brand-magenta" />
        <div className="min-w-0 flex-1">
          <p className="font-wide text-lg font-bold">Voir les films et séries tendance</p>
          <p className="mt-1 text-sm text-mist">Ajoutez une clé TMDB gratuite : l’accueil affichera les titres les plus regardés de la semaine présents dans votre abonnement.</p>
        </div>
        <Button onClick={() => setCurrentView('settings')}>Ajouter la clé</Button>
      </div>
    </section>
  )
}

const EmptyHome: React.FC = () => {
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  return (
    <section className="px-[var(--gutter)] py-24">
      <h1 className="font-xwide text-4xl font-extrabold">Votre source est vide</h1>
      <p className="mt-3 max-w-lg text-mist">Aucune chaîne n’a été trouvée. Vérifiez l’abonnement ou changez de source dans les réglages.</p>
      <Button className="mt-8" variant="primary" icon={<Radio className="size-5" />} onClick={() => setCurrentView('settings')}>
        Ouvrir les réglages
      </Button>
    </section>
  )
}

const UNIVERSE_ROWS: { id: Universe; title: string }[] = [
  { id: 'france', title: 'En direct · France' },
  { id: 'sport', title: 'En direct · Sport' },
]

export const HomeView: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const favorites = useIptvStore((s) => s.favorites)
  const recentlyWatched = useIptvStore((s) => s.recentlyWatched)
  const vodMovies = useVisibleVod(useIptvStore((s) => s.vodMovies)).visible
  const vodSeries = useVisibleVod(useIptvStore((s) => s.vodSeries)).visible
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const selectCategory = useIptvStore((s) => s.selectCategory)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const now = useNow()

  const trendingMovies = useTrending('movie', vodMovies)
  const trendingSeries = useTrending('tv', vodSeries)
  const hasVod = vodMovies.length + vodSeries.length > 0

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const byId = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels])

  // Chaînes récentes relues dans la liste à jour (numéro, programme en cours), puis favoris
  const myChannels = useMemo(() => {
    const recents = recentlyWatched.map((c) => byId.get(c.id)).filter((c): c is Channel => !!c)
    const seen = new Set(recents.map((c) => c.id))
    const favs = channels.filter((c) => favoriteSet.has(c.id) && !seen.has(c.id))
    return [...recents, ...favs].slice(0, ROW_LIMIT)
  }, [recentlyWatched, byId, channels, favoriteSet])

  const resumeItems = useMemo(() => {
    const vodById = new Map([...vodMovies, ...vodSeries].map((v) => [v.id, v]))
    return Object.values(vodResumePoints)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => {
        // Les épisodes sont enregistrés sous « idSérie_ep_idÉpisode »
        const item = vodById.get(p.id) || vodById.get(p.id.split('_ep_')[0])
        return item ? { item, progress: p.duration ? (p.currentTime / p.duration) * 100 : 0 } : null
      })
      .filter((x): x is { item: VodItem; progress: number } => !!x)
      .filter((x, i, arr) => arr.findIndex((y) => y.item.id === x.item.id) === i)
      .slice(0, ROW_LIMIT)
  }, [vodMovies, vodSeries, vodResumePoints])

  const universeRows = useMemo(
    () =>
      UNIVERSE_ROWS.map((u) => ({
        ...u,
        // Les chaînes avec un programme connu d'abord : la rangée montre « ce qui passe »
        items: channels
          .filter((c) => categoryUniverse(channelCategory(c)) === u.id)
          .sort((a, b) => Number(!!b.currentProgram) - Number(!!a.currentProgram))
          .slice(0, ROW_LIMIT),
      })).filter((r) => r.items.length > 0),
    [channels]
  )

  // Sans TMDB (ou rien de tendance dans le catalogue) : nouveautés et mieux notés du fournisseur
  const fallbackRows = useMemo(() => {
    if (trendingMovies.matches.length + trendingSeries.matches.length > 0) return []
    return [
      { key: 'new-movies', title: 'Films ajoutés récemment', items: recentlyAdded(vodMovies, ROW_LIMIT), view: 'movies' as const },
      { key: 'new-series', title: 'Séries ajoutées récemment', items: recentlyAdded(vodSeries, ROW_LIMIT), view: 'series' as const },
      { key: 'top-movies', title: 'Films les mieux notés', items: topRated(vodMovies, ROW_LIMIT), view: 'movies' as const },
      { key: 'top-series', title: 'Séries les mieux notées', items: topRated(vodSeries, ROW_LIMIT), view: 'series' as const },
    ].filter((r) => r.items.length > 0)
  }, [trendingMovies.matches, trendingSeries.matches, vodMovies, vodSeries])

  if (channels.length === 0 && !hasVod) return <EmptyHome />

  const featured = trendingMovies.matches.find((m) => m.entry.backdrop) || trendingSeries.matches.find((m) => m.entry.backdrop)
  const heroChannel = myChannels[0] || channels.find((c) => c.currentProgram) || channels[0]

  const openUniverse = (u: Universe) => {
    selectCategory(universeSelection(u))
    setCurrentView('live')
  }

  return (
    <div className="space-y-11 pb-16">
      {featured ? (
        <FeaturedHero match={featured} />
      ) : heroChannel ? (
        <ChannelHero channel={heroChannel} label={myChannels[0] ? 'Reprendre' : 'À regarder maintenant'} now={now} />
      ) : null}

      {resumeItems.length > 0 && (
        <Row title="Reprendre la lecture">
          {resumeItems.map(({ item, progress }) => (
            <PosterCard key={item.id} item={item} progress={progress} onOpen={openVodDetail} />
          ))}
        </Row>
      )}

      {trendingMovies.matches.length > 0 && (
        <Row title="Films tendance cette semaine" onSeeAll={() => setCurrentView('movies')}>
          {trendingMovies.matches.slice(0, ROW_LIMIT).map((m) => (
            <PosterCard key={m.item.id} item={m.item} rank={m.rank} poster={m.entry.poster} onOpen={openVodDetail} />
          ))}
        </Row>
      )}

      {trendingSeries.matches.length > 0 && (
        <Row title="Séries tendance cette semaine" onSeeAll={() => setCurrentView('series')}>
          {trendingSeries.matches.slice(0, ROW_LIMIT).map((m) => (
            <PosterCard key={m.item.id} item={m.item} rank={m.rank} poster={m.entry.poster} onOpen={openVodDetail} />
          ))}
        </Row>
      )}

      {myChannels.length > 0 && (
        <Row title="Vos chaînes" meta={myChannels.length} onSeeAll={() => setCurrentView('favorites')}>
          {myChannels.map((c) => (
            <ChannelTile key={c.id} channel={c} now={now} isFavorite={favoriteSet.has(c.id)} onPlay={setActiveChannel} />
          ))}
        </Row>
      )}

      {hasVod && !trendingMovies.enabled && <TrendingInvite />}

      {fallbackRows.map((r) => (
        <Row key={r.key} title={r.title} onSeeAll={() => setCurrentView(r.view)}>
          {r.items.map((it) => (
            <PosterCard key={it.id} item={it} onOpen={openVodDetail} />
          ))}
        </Row>
      ))}

      {universeRows.map((r) => (
        <Row key={r.id} title={r.title} onSeeAll={() => openUniverse(r.id)}>
          {r.items.map((c) => (
            <ChannelTile key={c.id} channel={c} now={now} isFavorite={favoriteSet.has(c.id)} onPlay={setActiveChannel} />
          ))}
        </Row>
      ))}

      {vodMovies.length > 0 && (
        <Row title="Tous les films" meta={vodMovies.length} onSeeAll={() => setCurrentView('movies')}>
          {vodMovies.slice(0, ROW_LIMIT).map((m) => (
            <PosterCard key={m.id} item={m} onOpen={openVodDetail} />
          ))}
        </Row>
      )}

      {vodSeries.length > 0 && (
        <Row title="Toutes les séries" meta={vodSeries.length} onSeeAll={() => setCurrentView('series')}>
          {vodSeries.slice(0, ROW_LIMIT).map((s) => (
            <PosterCard key={s.id} item={s} onOpen={openVodDetail} />
          ))}
        </Row>
      )}
    </div>
  )
}
