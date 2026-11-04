import React, { useCallback, useMemo, useState } from 'react'
import { Info, LayoutGrid, Play } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { VodItem } from '../types/iptv'
import { categoryLabel } from '../services/categoryService'
import { recentlyAdded, topRated } from '../services/trendingService'
import { useTrending } from '../hooks/useTrending'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { useBackHandler } from '../hooks/useBackHandler'
import { Button } from '../ui/Button'
import VodView from '../views/VodView'
import { TvBrowse, type BrowseItem, type BrowseRow } from './TvBrowse'

const ROW_LIMIT = 30

/**
 * Films / Séries sur téléviseur : une rangée par genre du fournisseur (comme Netflix),
 * précédées de « Reprendre », du Top 10 et des nouveautés. « Tout parcourir » ouvre la grille complète
 * (recherche, tri, filtres), d'où Retour ramène aux rangées.
 */
const TvVodBrowse: React.FC<{ type: 'movie' | 'series' }> = ({ type }) => {
  const allItems = useIptvStore((s) => (type === 'movie' ? s.vodMovies : s.vodSeries))
  const items = useVisibleVod(allItems).visible
  const vodResumePoints = useIptvStore((s) => s.vodResumePoints)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const playVod = useIptvStore((s) => s.playVod)
  const trending = useTrending(type === 'movie' ? 'movie' : 'tv', items)
  // Grille complète ouverte (null = rangées), sur une catégorie ou sur tout le catalogue
  const [grid, setGrid] = useState<string | null>(null)
  useBackHandler(grid !== null, () => setGrid(null))

  const noun = type === 'movie' ? 'films' : 'séries'

  const rows = useMemo<BrowseRow[]>(() => {
    const entry = (item: VodItem, prefix: string, extra: Partial<Extract<BrowseItem, { kind: 'vod' }>> = {}): BrowseItem => ({
      kind: 'vod',
      key: `${prefix}${item.id}`,
      item,
      ...extra,
    })
    const list: BrowseRow[] = []

    const byId = new Map(items.map((it) => [it.id, it]))
    const seen = new Set<string>()
    const resume: BrowseItem[] = []
    for (const p of Object.values(vodResumePoints).sort((a, b) => b.updatedAt - a.updatedAt)) {
      const item = byId.get(p.id.split('_ep_')[0])
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      resume.push(entry(item, 'r-', { progress: p.duration ? (p.currentTime / p.duration) * 100 : 0 }))
    }
    if (resume.length) list.push({ key: 'resume', title: 'Reprendre', variant: 'landscape', items: resume.slice(0, ROW_LIMIT) })

    if (trending.matches.length) {
      list.push({
        key: 'top',
        title: `Top 10 des ${noun} cette semaine`,
        variant: 'top10',
        items: trending.matches.slice(0, 10).map((m) => entry(m.item, 't-', { rank: m.rank, poster: m.entry.poster, backdrop: m.entry.backdrop })),
      })
    }
    const recent = recentlyAdded(items, ROW_LIMIT)
    if (recent.length) list.push({ key: 'recent', title: 'Ajoutés récemment', variant: 'poster', items: recent.map((it) => entry(it, 'n-')) })
    const best = topRated(items, ROW_LIMIT)
    if (best.length) list.push({ key: 'best', title: 'Les mieux notés', variant: 'poster', items: best.map((it) => entry(it, 'b-')) })

    // Une rangée par catégorie, dans l'ordre du fournisseur
    const groups = new Map<string, VodItem[]>()
    for (const it of items) {
      const g = groups.get(it.category)
      if (g) g.push(it)
      else groups.set(it.category, [it])
    }
    for (const [cat, list2] of groups) {
      const rowItems: BrowseItem[] = list2.slice(0, ROW_LIMIT).map((it) => entry(it, `c${cat}-`))
      if (list2.length > ROW_LIMIT) {
        rowItems.push({ kind: 'more', key: `more-${cat}`, label: `Tout ${categoryLabel(cat)}`, count: list2.length, onOpen: () => setGrid(cat) })
      }
      list.push({ key: `cat-${cat}`, title: categoryLabel(cat), variant: 'poster', items: rowItems })
    }
    return list
  }, [items, vodResumePoints, trending.matches, noun])

  const onOpen = useCallback(
    (e: BrowseItem) => {
      if (e.kind === 'more') e.onOpen()
      else if (e.kind === 'vod') {
        if (e.progress && e.item.type === 'movie') playVod(e.item)
        else openVodDetail(e.item)
      }
    },
    [playVod, openVodDetail]
  )

  if (grid !== null || items.length === 0) {
    return (
      <div className="h-dvh overflow-y-auto">
        <VodView type={type} initialCategory={grid ?? 'ALL'} />
      </div>
    )
  }

  const top = trending.matches.find((m) => m.entry.backdrop)
  const firstResume = rows[0]?.key === 'resume' ? rows[0].items[0] : undefined
  const billboard: BrowseItem | undefined = top
    ? { kind: 'vod', key: `bb-${top.item.id}`, item: top.item, rank: top.rank, poster: top.entry.poster, backdrop: top.entry.backdrop }
    : firstResume || rows.find((r) => r.key === 'recent')?.items[0] || rows[0]?.items[0]
  const label = top ? `N°${top.rank} des tendances cette semaine` : billboard === firstResume ? 'Reprendre' : type === 'movie' ? 'Film à découvrir' : 'Série à découvrir'

  const actions =
    billboard?.kind === 'vod' ? (
      <>
        <Button
          variant="primary"
          size="lg"
          data-autofocus
          icon={<Play className="size-5 fill-current" />}
          onClick={() => (billboard.item.type === 'movie' ? playVod(billboard.item) : openVodDetail(billboard.item))}
        >
          {billboard.item.type === 'movie' ? (billboard.progress ? 'Reprendre' : 'Lecture') : 'Épisodes'}
        </Button>
        <Button size="lg" icon={<Info className="size-5" />} onClick={() => openVodDetail(billboard.item)}>
          Plus d’infos
        </Button>
        <Button size="lg" variant="ghost" icon={<LayoutGrid className="size-5" />} onClick={() => setGrid('ALL')}>
          Tout parcourir
        </Button>
      </>
    ) : null

  return <TvBrowse rows={rows} billboard={billboard} billboardLabel={label} billboardActions={actions} onOpen={onOpen} />
}

export default TvVodBrowse
