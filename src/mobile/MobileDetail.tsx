import React, { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Clock, ExternalLink, Play, Plus, RotateCcw, Star } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { SeriesEpisode, VodItem } from '../types/iptv'
import { useVodDetails } from '../hooks/useVodDetails'
import { useBackHandler } from '../hooks/useBackHandler'
import { hasExternalPlayers, nativePlatform, openInExternalPlayer } from '../native'
import { categoryLabel } from '../services/categoryService'
import { unavailableNotice } from '../services/streamCheck'
import { BrandMark } from '../ui/Brand'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { topRated } from '../services/trendingService'
import { Artwork, Pills, Poster, TrailProgress } from './parts'

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

const epLabel = (ep: SeriesEpisode) => `S${String(ep.season).padStart(2, '0')} É${String(ep.episodeNum).padStart(2, '0')}`

/** Action ronde sous le bouton de lecture : Ma liste, Depuis le début, VLC. */
const RoundAction: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; active?: boolean }> = ({ label, onClick, children, active }) => (
  <button type="button" onClick={onClick} className="m-press flex min-w-[4.5rem] flex-col items-center gap-1.5 text-[0.74rem] font-semibold text-mist">
    <span className={`flex size-12 items-center justify-center rounded-full ring-1 ${active ? 'bg-paper text-ink-950 ring-paper' : 'bg-white/[0.08] text-paper ring-white/10'}`}>
      {children}
    </span>
    {label}
  </button>
)

/** Ligne d'épisode : vignette, numéro, résumé, progression. */
const EpisodeRow: React.FC<{ ep: SeriesEpisode; progress?: number; onPlay: () => void }> = ({ ep, progress, onPlay }) => (
  <li>
    <button type="button" onClick={onPlay} className="m-press flex w-full gap-3.5 py-2.5 text-left">
      <div className="relative w-[8.5rem] shrink-0 overflow-hidden rounded-[0.7rem]">
        {ep.image ? (
          <Artwork sources={[ep.image]} title="" className="aspect-video" />
        ) : (
          <div className="flex aspect-video items-center justify-center bg-ink-850">
            <span className="m-heading text-2xl text-fog tabular">{String(ep.episodeNum).padStart(2, '0')}</span>
          </div>
        )}
        <span className="absolute inset-0 m-auto flex size-8 items-center justify-center rounded-full bg-ink-950/70">
          <Play className="size-3.5 translate-x-px fill-paper text-paper" />
        </span>
        {progress ? <TrailProgress value={progress} className="absolute inset-x-1.5 bottom-1.5" /> : null}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-[0.74rem] font-semibold text-fog tabular">
          Épisode {ep.episodeNum}
          {ep.duration ? ` · ${ep.duration}` : ''}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[0.92rem] font-semibold leading-snug text-paper">{ep.title}</p>
        {ep.plot && <p className="mt-1 line-clamp-2 text-[0.8rem] leading-snug text-mist">{ep.plot}</p>}
      </div>
    </button>
  </li>
)

const MobileDetail: React.FC = () => {
  const item = useIptvStore((s) => s.vodDetail) as VodItem
  const closeVodDetail = useIptvStore((s) => s.closeVodDetail)
  const playVod = useIptvStore((s) => s.playVod)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const isFavorite = useIptvStore((s) => s.favorites.includes(item.id))
  const { details, seasons, season, setSeason, currentSeason, loading, episodesError, isXtreamSeries, movieResume, lastEpisode, vodResumePoints, directPlayable, unavailable } =
    useVodDetails(item)
  const [expanded, setExpanded] = useState(false)
  const catalog = useIptvStore((s) => (item.type === 'movie' ? s.vodMovies : s.vodSeries))
  const visibleCatalog = useVisibleVod(catalog).visible
  // Dans le même genre : les mieux notés du même rayon de l'abonnement
  const similar = useMemo(() => topRated(visibleCatalog.filter((v) => v.category === item.category && v.id !== item.id), 15), [visibleCatalog, item.category, item.id])

  useBackHandler(true, closeVodDetail)

  // Glisser vers le bas depuis le haut de la fiche la referme, comme une feuille iOS
  const scroller = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ y: number; active: boolean } | null>(null)
  const [offset, setOffset] = useState(0)
  // Au-delà de l'image, une barre floutée porte le titre et garde le contenu hors de la barre d'état
  const [scrolled, setScrolled] = useState(false)
  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = { y: e.touches[0].clientY, active: (scroller.current?.scrollTop ?? 0) <= 0 }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current?.active) return
    const dy = e.touches[0].clientY - drag.current.y
    setOffset(dy > 0 ? dy * 0.55 : 0)
  }
  const onTouchEnd = () => {
    if (offset > 110) closeVodDetail()
    else setOffset(0)
    drag.current = null
  }

  const resumeAt = movieResume && movieResume.currentTime > 10 ? movieResume.currentTime : 0
  const backdrop = details.backdrop
  const poster = details.logo
  const meta = [details.year, item.category && categoryLabel(item.category)].filter(Boolean)

  const play = () => {
    if (isXtreamSeries && seasons && seasons.length > 0) playVod(details, { episode: lastEpisode || seasons[0].episodes[0] })
    else if (directPlayable) playVod(details)
  }
  const canPlay = directPlayable || (isXtreamSeries && !!seasons && seasons.length > 0)
  const playLabel = isXtreamSeries
    ? lastEpisode
      ? `Reprendre ${epLabel(lastEpisode)}`
      : 'Premier épisode'
    : resumeAt
      ? `Reprendre à ${formatClock(resumeAt)}`
      : 'Lecture'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={details.cleanTitle}
      className="fixed inset-0 z-50 bg-ink-950/60"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        ref={scroller}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 100)}
        className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain bg-ink-950 animate-m-sheet"
        style={{ transform: offset ? `translateY(${offset}px)` : undefined, transition: offset ? 'none' : 'transform 320ms var(--ease-snap)', borderRadius: offset ? '1.5rem' : undefined }}
      >
        {/* Image d'ambiance : le fond du titre, ou son affiche floutée */}
        <div className="relative h-[21rem] overflow-hidden">
          {backdrop ? (
            <img src={backdrop} alt="" className="size-full object-cover" />
          ) : poster ? (
            <img src={poster} alt="" className="size-full scale-125 object-cover opacity-50 blur-2xl" />
          ) : (
            <div className="size-full bg-[radial-gradient(80%_70%_at_70%_10%,var(--color-ink-700),transparent)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(3_9_25/0.35),transparent_30%,rgb(3_9_25/0.6)_70%,var(--color-ink-950))]" />
        </div>

        <div className="relative -mt-44 px-[var(--m-gutter)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
          {/* L'affiche et le titre côte à côte : la fiche s'ouvre sur l'identité du titre */}
          <div className="flex items-end gap-4">
            <div className="w-[7.5rem] shrink-0 overflow-hidden rounded-[1.125rem] shadow-[0_1.5rem_3rem_-1rem_rgb(0_0_0/0.9)]" style={{ viewTransitionName: 'm-poster' }}>
              <Artwork sources={[poster]} title={details.cleanTitle} className="aspect-[2/3]" titleSize="sm" eager />
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <h1 className="m-display text-[1.95rem] text-paper text-balance break-words">{details.cleanTitle}</h1>
              {details.rating ? (
                <p className="mt-2 inline-flex items-center gap-1 text-[0.88rem] font-semibold text-paper">
                  <Star className="size-3.5 fill-brand-yellow text-brand-yellow" /> {details.rating.toFixed(1)}
                </p>
              ) : null}
              {loading && <BrandMark pulse className="mt-1 h-6" />}
            </div>
          </div>

          <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.85rem] text-mist">
            <span className="font-semibold text-paper">{item.type === 'movie' ? 'Film' : 'Série'}</span>
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
            {details.runtime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {details.runtime}
              </span>
            )}
            {details.genres?.slice(0, 2).map((g) => (
              <span key={g}>{g}</span>
            ))}
          </p>

          {/* Lecture et Ma liste sur la même ligne : les deux gestes qu'on fait sur une fiche */}
          <div className="mt-6 flex gap-2.5">
            {canPlay && (
              <button
                type="button"
                onClick={play}
                className="m-press flex h-[3.25rem] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[0.95rem] bg-paper px-3 text-[1.02rem] font-bold text-ink-950"
              >
                <Play className="size-5 shrink-0 fill-current" /> <span className="truncate">{playLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleFavorite(item.id)}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
              className={`m-press flex h-[3.25rem] shrink-0 items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[0.92rem] font-semibold ring-1 ${
                canPlay ? '' : 'flex-1'
              } ${isFavorite ? 'bg-white/[0.12] text-paper ring-white/20' : 'bg-white/[0.07] text-paper ring-white/10'}`}
            >
              {isFavorite ? <Check className="size-5" /> : <Plus className="size-5" />}
              {canPlay ? 'Ma liste' : isFavorite ? 'Dans ma liste' : 'Ajouter à ma liste'}
            </button>
          </div>
          {unavailable && (
            <p role="status" className="mt-4 flex items-start gap-2.5 rounded-[0.95rem] bg-onair/10 px-3.5 py-3 text-[0.84rem] leading-snug text-paper ring-1 ring-onair/30">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-onair" />
              {unavailableNotice(item.type, unavailable.status)}
            </p>
          )}
          {resumeAt > 0 && movieResume && movieResume.duration > 0 && directPlayable && (
            <div className="mt-3 flex items-center gap-3">
              <TrailProgress value={(movieResume.currentTime / movieResume.duration) * 100} className="flex-1" />
              <span className="shrink-0 text-[0.76rem] text-fog tabular">{formatClock(Math.max(0, movieResume.duration - movieResume.currentTime))} restantes</span>
            </div>
          )}

          {((resumeAt > 0 && directPlayable) || (hasExternalPlayers && directPlayable)) && (
          <div className="mt-5 flex gap-6">
            {resumeAt > 0 && directPlayable && (
              <RoundAction label="Du début" onClick={() => playVod(details, { fromStart: true })}>
                <RotateCcw className="size-5" />
              </RoundAction>
            )}
            {hasExternalPlayers && directPlayable && (
              <RoundAction
                label={nativePlatform === 'ios' ? 'VLC' : 'Autre lecteur'}
                onClick={() => void openInExternalPlayer(details.streamUrl, nativePlatform === 'ios' ? 'ios-vlc' : 'ask', details.cleanTitle)}
              >
                <ExternalLink className="size-5" />
              </RoundAction>
            )}
          </div>
          )}

          {details.overview ? (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-7 block text-left">
              <p className={`text-[0.95rem] leading-relaxed text-mist ${expanded ? '' : 'line-clamp-4'}`}>{details.overview}</p>
              {!expanded && details.overview.length > 220 && <span className="mt-1 block text-[0.85rem] font-semibold text-paper">Lire la suite</span>}
            </button>
          ) : (
            !loading && <p className="mt-7 text-[0.9rem] text-fog">Pas de résumé disponible pour ce titre.</p>
          )}

          {(details.director || details.cast) && (
            <dl className="mt-5 space-y-2 text-[0.85rem]">
              {details.director && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-fog">Réalisation</dt>
                  <dd className="text-mist">{details.director}</dd>
                </div>
              )}
              {details.cast && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-fog">Avec</dt>
                  <dd className="line-clamp-3 text-mist">{details.cast}</dd>
                </div>
              )}
            </dl>
          )}

          {isXtreamSeries && (
            <section className="mt-10">
              <h2 className="m-heading text-[1.45rem]">Épisodes</h2>
              {episodesError && <p className="mt-3 text-[0.9rem] text-onair">{episodesError}</p>}
              {!seasons && !episodesError && <BrandMark pulse className="mt-5 h-10" />}
              {seasons && seasons.length === 0 && <p className="mt-3 text-mist">Le fournisseur ne liste aucun épisode pour cette série.</p>}
              {seasons && seasons.length > 1 && season !== null && (
                <Pills
                  ariaLabel="Saisons"
                  options={seasons.map((s) => ({ id: s.season, label: `Saison ${s.season}`, count: s.episodes.length }))}
                  value={season}
                  onChange={setSeason}
                  className="-mx-[var(--m-gutter)] mt-3"
                />
              )}
              {currentSeason && (
                <ol className="mt-2 divide-y divide-white/[0.06]">
                  {currentSeason.episodes.map((ep) => {
                    const point = vodResumePoints[`${item.id}_ep_${ep.id}`]
                    return (
                      <EpisodeRow
                        key={ep.id}
                        ep={ep}
                        progress={point?.duration ? (point.currentTime / point.duration) * 100 : undefined}
                        onPlay={() => playVod(details, { episode: ep })}
                      />
                    )
                  })}
                </ol>
              )}
            </section>
          )}

          {similar.length > 0 && (
            <section className="-mx-[var(--m-gutter)] mt-12">
              <h2 className="m-heading px-[var(--m-gutter)] text-[1.45rem]">Dans le même genre</h2>
              <p className="mt-1 px-[var(--m-gutter)] text-[0.82rem] text-fog">{categoryLabel(item.category)}</p>
              <div className="m-rail mt-3 gap-2.5">
                {similar.map((v) => (
                  <Poster key={v.id} item={v} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <div
        aria-hidden={!scrolled}
        className={`pointer-events-none absolute inset-x-0 top-0 z-[5] transition-opacity duration-300 ${scrolled ? 'm-bar opacity-100' : 'opacity-0'}`}
        style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
      >
        <div className="flex h-[calc(env(safe-area-inset-top)+4rem)] items-end justify-center px-16 pb-3.5">
          <p className="truncate font-display text-[0.98rem] font-bold text-paper">{details.cleanTitle}</p>
        </div>
        <div className="h-px bg-white/8" />
      </div>

      <button
        type="button"
        onClick={closeVodDetail}
        aria-label="Fermer la fiche"
        className="m-press m-bar absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex size-10 items-center justify-center rounded-full text-paper ring-1 ring-white/10"
        style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
      >
        <ChevronDown className="size-6" />
      </button>
    </div>
  )
}

export default MobileDetail
