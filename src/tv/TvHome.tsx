import React, { useCallback, useMemo } from 'react'
import { Heart, Info, Play, Radio, Sparkles } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { categoryUniverse, channelCategory, universeSelection, type Universe } from '../services/categoryService'
import { recentlyAdded, topRated } from '../services/trendingService'
import type { Channel, VodItem } from '../types/iptv'
import { useTrending } from '../hooks/useTrending'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { Button } from '../ui/Button'
import { TvBrowse, type BrowseItem, type BrowseRow } from './TvBrowse'

const ROW_LIMIT = 30

const vodEntry = (item: VodItem, extra: Partial<Extract<BrowseItem, { kind: 'vod' }>> = {}, prefix = ''): BrowseItem => ({
  kind: 'vod',
  key: `${prefix}${item.id}`,
  item,
  ...extra,
})
const channelEntry = (channel: Channel, prefix = ''): BrowseItem => ({ kind: 'channel', key: `${prefix}${channel.id}`, channel })

const UNIVERSE_ROWS: { id: Universe; title: string }[] = [
  { id: 'france', title: 'En direct · France' },
  { id: 'sport', title: 'En direct · Sport' },
]

/** Accueil TV : billboard + rangées (reprendre, tendances, chaînes, nouveautés, catalogue). */
export const TvHome: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const favorites = useIptvStore((s) => s.favorites)
  const recentlyWatched = useIptvStore((s) => s.recentlyWatched)
  const vodMovies = useVisibleVod(useIptvStore((s) => s.vodMovies)).visible
  const vodSeries = useVisibleVod(useIptvStore((s) => s.vodSeries)).visible
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const playVod = useIptvStore((s) => s.playVod)
  const selectCategory = useIptvStore((s) => s.selectCategory)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)

  const trendingMovies = useTrending('movie', vodMovies)
  const trendingSeries = useTrending('tv', vodSeries)

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const myChannels = useMemo(() => {
    const byId = new Map(channels.map((c) => [c.id, c]))
    const recents = recentlyWatched.map((c) => byId.get(c.id)).filter((c): c is Channel => !!c)
    const seen = new Set(recents.map((c) => c.id))
    return [...recents, ...channels.filter((c) => favoriteSet.has(c.id) && !seen.has(c.id))].slice(0, ROW_LIMIT)
  }, [recentlyWatched, channels, favoriteSet])

  const resume = useMemo(() => {
    const vodById = new Map([...vodMovies, ...vodSeries].map((v) => [v.id, v]))
    const seen = new Set<string>()
    const list: { item: VodItem; progress: number }[] = []
    for (const p of Object.values(vodResumePoints).sort((a, b) => b.updatedAt - a.updatedAt)) {
      // Les épisodes sont enregistrés sous « idSérie_ep_idÉpisode »
      const item = vodById.get(p.id) || vodById.get(p.id.split('_ep_')[0])
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      list.push({ item, progress: p.duration ? (p.currentTime / p.duration) * 100 : 0 })
      if (list.length >= ROW_LIMIT) break
    }
    return list
  }, [vodMovies, vodSeries, vodResumePoints])

  const rows = useMemo<BrowseRow[]>(() => {
    const list: BrowseRow[] = []
    const more = (key: string, label: string, count: number, onOpen: () => void): BrowseItem => ({ kind: 'more', key: `more-${key}`, label, count, onOpen })

    if (resume.length) {
      list.push({
        key: 'resume',
        title: 'Reprendre la lecture',
        variant: 'landscape',
        items: resume.map(({ item, progress }) => vodEntry(item, { progress }, 'r-')),
      })
    }
    if (myChannels.length) {
      list.push({ key: 'my-channels', title: 'Vos chaînes', variant: 'channel', items: myChannels.map((c) => channelEntry(c, 'm-')) })
    }
    if (trendingMovies.matches.length) {
      list.push({
        key: 'top-movies',
        title: 'Top 10 des films cette semaine',
        variant: 'top10',
        items: trendingMovies.matches.slice(0, 10).map((m) => vodEntry(m.item, { rank: m.rank, poster: m.entry.poster, backdrop: m.entry.backdrop }, 't-')),
      })
    }
    if (trendingSeries.matches.length) {
      list.push({
        key: 'top-series',
        title: 'Top 10 des séries cette semaine',
        variant: 'top10',
        items: trendingSeries.matches.slice(0, 10).map((m) => vodEntry(m.item, { rank: m.rank, poster: m.entry.poster, backdrop: m.entry.backdrop }, 'ts-')),
      })
    }
    const newMovies = recentlyAdded(vodMovies, ROW_LIMIT)
    if (newMovies.length) list.push({ key: 'new-movies', title: 'Films ajoutés récemment', variant: 'poster', items: newMovies.map((m) => vodEntry(m, {}, 'nm-')) })
    for (const u of UNIVERSE_ROWS) {
      const items = channels
        .filter((c) => categoryUniverse(channelCategory(c)) === u.id)
        // Les chaînes avec un programme connu d'abord : la rangée montre « ce qui passe »
        .sort((a, b) => Number(!!b.currentProgram) - Number(!!a.currentProgram))
        .slice(0, ROW_LIMIT)
      if (items.length) {
        list.push({
          key: `u-${u.id}`,
          title: u.title,
          variant: 'channel',
          items: [
            ...items.map((c) => channelEntry(c, `u${u.id}-`)),
            more(u.id, 'Toutes les chaînes', 0, () => {
              selectCategory(universeSelection(u.id))
              setCurrentView('live')
            }),
          ],
        })
      }
    }
    const newSeries = recentlyAdded(vodSeries, ROW_LIMIT)
    if (newSeries.length) list.push({ key: 'new-series', title: 'Séries ajoutées récemment', variant: 'poster', items: newSeries.map((m) => vodEntry(m, {}, 'ns-')) })
    const bestMovies = topRated(vodMovies, ROW_LIMIT)
    if (bestMovies.length) list.push({ key: 'best-movies', title: 'Films les mieux notés', variant: 'poster', items: bestMovies.map((m) => vodEntry(m, {}, 'bm-')) })
    const bestSeries = topRated(vodSeries, ROW_LIMIT)
    if (bestSeries.length) list.push({ key: 'best-series', title: 'Séries les mieux notées', variant: 'poster', items: bestSeries.map((m) => vodEntry(m, {}, 'bs-')) })
    if (vodMovies.length) {
      list.push({
        key: 'all-movies',
        title: 'Tous les films',
        variant: 'poster',
        items: [...vodMovies.slice(0, ROW_LIMIT).map((m) => vodEntry(m, {}, 'am-')), more('movies', 'Tous les films', vodMovies.length, () => setCurrentView('movies'))],
      })
    }
    if (vodSeries.length) {
      list.push({
        key: 'all-series',
        title: 'Toutes les séries',
        variant: 'poster',
        items: [...vodSeries.slice(0, ROW_LIMIT).map((m) => vodEntry(m, {}, 'as-')), more('series', 'Toutes les séries', vodSeries.length, () => setCurrentView('series'))],
      })
    }
    return list
  }, [resume, myChannels, trendingMovies.matches, trendingSeries.matches, vodMovies, vodSeries, channels, selectCategory, setCurrentView])

  // À la une : le n°1 des tendances avec une image, sinon la lecture en cours, sinon la dernière chaîne
  const featured = trendingMovies.matches.find((m) => m.entry.backdrop) || trendingSeries.matches.find((m) => m.entry.backdrop)
  const heroChannel = myChannels[0] || channels.find((c) => c.currentProgram) || channels[0]
  const billboard: BrowseItem | undefined = featured
    ? vodEntry(featured.item, { rank: featured.rank, poster: featured.entry.poster, backdrop: featured.entry.backdrop }, 'b-')
    : resume[0]
      ? vodEntry(resume[0].item, { progress: resume[0].progress }, 'b-')
      : heroChannel
        ? channelEntry(heroChannel, 'b-')
        : undefined
  const billboardLabel = featured
    ? `N°${featured.rank} des tendances cette semaine`
    : billboard?.kind === 'vod'
      ? 'Reprendre la lecture'
      : myChannels[0]
        ? 'Dernière chaîne regardée'
        : 'À regarder maintenant'

  const onOpen = useCallback(
    (entry: BrowseItem) => {
      if (entry.kind === 'more') entry.onOpen()
      else if (entry.kind === 'channel') setActiveChannel(entry.channel)
      // Reprendre un film : lecture directe (Netflix) ; une série ouvre ses épisodes
      else if (entry.progress && entry.item.type === 'movie') playVod(entry.item)
      else openVodDetail(entry.item)
    },
    [setActiveChannel, playVod, openVodDetail]
  )

  let actions: React.ReactNode = null
  if (billboard?.kind === 'vod') {
    const { item } = billboard
    const isMovie = item.type === 'movie'
    actions = (
      <>
        <Button variant="primary" size="lg" data-autofocus icon={<Play className="size-5 fill-current" />} onClick={() => (isMovie ? playVod(item) : openVodDetail(item))}>
          {isMovie ? (billboard.progress ? 'Reprendre' : 'Lecture') : 'Épisodes'}
        </Button>
        <Button size="lg" icon={<Info className="size-5" />} onClick={() => openVodDetail(item)}>
          Plus d’infos
        </Button>
      </>
    )
  } else if (billboard?.kind === 'channel') {
    const fav = favoriteSet.has(billboard.channel.id)
    actions = (
      <>
        <Button variant="primary" size="lg" data-autofocus icon={<Play className="size-5 fill-current" />} onClick={() => setActiveChannel(billboard.channel)}>
          Regarder
        </Button>
        <Button size="lg" icon={<Heart className={`size-5 ${fav ? 'fill-accent text-accent' : ''}`} />} onClick={() => toggleFavorite(billboard.channel.id)}>
          {fav ? 'Dans vos favoris' : 'Ajouter aux favoris'}
        </Button>
      </>
    )
  }

  if (!billboard && rows.length === 0) {
    return (
      <section className="px-[var(--gutter)] py-24">
        <h1 className="font-xwide text-4xl font-extrabold">Votre source est vide</h1>
        <p className="mt-3 max-w-lg text-mist">Aucune chaîne n’a été trouvée. Vérifiez l’abonnement ou changez de source dans les réglages.</p>
        <Button className="mt-8" variant="primary" data-autofocus icon={<Radio className="size-5" />} onClick={() => setCurrentView('settings')}>
          Ouvrir les réglages
        </Button>
      </section>
    )
  }

  const tmdbInvite =
    vodMovies.length + vodSeries.length > 0 && !trendingMovies.enabled ? (
      <p className="flex items-center gap-[0.5rem] px-[var(--gutter)] pb-[2rem] pt-[0.5rem] text-[0.7rem] text-fog">
        <Sparkles className="size-[0.9rem] text-brand-magenta" />
        Top 10 et images de fond : ajoutez une clé TMDB gratuite dans Réglages.
      </p>
    ) : null

  return <TvBrowse rows={rows} billboard={billboard} billboardLabel={billboardLabel} billboardActions={actions} onOpen={onOpen} empty={tmdbInvite} />
}

export default TvHome
