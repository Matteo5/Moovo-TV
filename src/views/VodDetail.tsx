import React, { useEffect } from 'react'
import { ArrowLeft, Play, RotateCcw, Heart, Star, Clock, ExternalLink } from 'lucide-react'
import { hasExternalPlayers, nativePlatform, openInExternalPlayer } from '../native'
import { useIptvStore } from '../store/useIptvStore'
import { useVodDetails } from '../hooks/useVodDetails'
import { useBackHandler, goBack } from '../hooks/useBackHandler'
import { focusFirstIn } from '../hooks/useSpatialNavigation'
import { Button, Chip } from '../ui/Button'
import { ProgressLine } from '../ui/Program'
import { BrandMark } from '../ui/Brand'
import { categoryLabel } from '../services/categoryService'

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

const VodDetail: React.FC = () => {
  const item = useIptvStore((s) => s.vodDetail)!
  const closeVodDetail = useIptvStore((s) => s.closeVodDetail)
  const playVod = useIptvStore((s) => s.playVod)
  const toggleFavorite = useIptvStore((s) => s.toggleFavorite)
  const isFavorite = useIptvStore((s) => s.favorites.includes(item.id))
  const {
    details,
    seasons,
    season,
    setSeason,
    currentSeason,
    loading,
    episodesError,
    isXtreamSeries,
    movieResume,
    lastEpisode,
    vodResumePoints,
    directPlayable,
  } = useVodDetails(item)

  useBackHandler(true, closeVodDetail)

  // Point d'entrée de la télécommande : le bouton de lecture
  useEffect(() => {
    const id = window.setTimeout(() => focusFirstIn(document.querySelector('[data-vod-detail]') || document), 60)
    return () => window.clearTimeout(id)
  }, [])

  const backdrop = details.backdrop || details.logo

  return (
    <div
      data-nav-trap
      data-vod-detail
      role="dialog"
      aria-modal="true"
      aria-label={details.cleanTitle}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-ink-950 animate-rise"
    >
      {/* Fond */}
      <div className="absolute inset-x-0 top-0 h-[78vh] overflow-hidden">
        {backdrop ? (
          <img src={backdrop} alt="" className={`size-full object-cover ${details.backdrop ? '' : 'scale-110 blur-2xl opacity-60 tv:blur-none tv:opacity-25'}`} />
        ) : (
          <div className="size-full bg-[radial-gradient(70%_60%_at_70%_20%,var(--accent-soft),transparent)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-ink-950/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/50 to-transparent" />
      </div>

      <div className="relative px-[var(--gutter)] pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Button variant="ghost" icon={<ArrowLeft className="size-5" />} onClick={() => goBack()} className="-ml-3">
          Retour
        </Button>

        <div className="mt-[18vh] grid gap-10 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="hidden md:block">
            {details.logo ? (
              <img src={details.logo} alt="" className="aspect-[2/3] w-full rounded-2xl object-cover shadow-[0_2rem_4rem_-1rem_rgb(0_0_0/0.9)] ring-1 ring-white/10" />
            ) : (
              <div className="flex aspect-[2/3] w-full items-end rounded-2xl bg-ink-850 p-5 ring-1 ring-white/10">
                <span className="streak h-1.5 w-full rounded-full" />
              </div>
            )}
          </div>

          <div className="max-w-3xl">
            <h1 className="font-xwide text-[clamp(2.2rem,5vw,4.2rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
              {details.cleanTitle}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-sm text-mist tabular">
              <span className="rounded-md streak px-2 py-0.5 font-display text-xs font-extrabold text-ink-950">{item.type === 'movie' ? 'Film' : 'Série'}</span>
              {item.category && <span className="font-sans">{categoryLabel(item.category)}</span>}
              {details.year && <span>{details.year}</span>}
              {details.runtime && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" /> {details.runtime}
                </span>
              )}
              {details.rating ? (
                <span className="inline-flex items-center gap-1.5 text-paper">
                  <Star className="size-3.5 fill-brand-yellow text-brand-yellow" /> {details.rating.toFixed(1)}
                </span>
              ) : null}
              {details.genres?.slice(0, 3).map((g) => (
                <span key={g} className="font-sans">{g}</span>
              ))}
              {loading && <BrandMark pulse className="h-6" />}
            </div>

            {/* Actions */}
            <div className="mt-8 flex flex-wrap gap-3">
              {directPlayable && (
                <>
                  <Button
                    variant="primary"
                    size="lg"
                    data-autofocus
                    icon={<Play className="size-5 fill-current" />}
                    onClick={() => playVod(details)}
                  >
                    {movieResume && movieResume.currentTime > 10 ? `Reprendre à ${formatClock(movieResume.currentTime)}` : 'Lecture'}
                  </Button>
                  {movieResume && movieResume.currentTime > 10 && (
                    <Button size="lg" icon={<RotateCcw className="size-5" />} onClick={() => playVod(details, { fromStart: true })}>
                      Depuis le début
                    </Button>
                  )}
                </>
              )}
              {isXtreamSeries && seasons && seasons.length > 0 && (
                <Button
                  variant="primary"
                  size="lg"
                  data-autofocus
                  icon={<Play className="size-5 fill-current" />}
                  onClick={() => playVod(details, { episode: lastEpisode || seasons[0].episodes[0] })}
                >
                  {lastEpisode
                    ? `Reprendre S${String(lastEpisode.season).padStart(2, '0')} É${String(lastEpisode.episodeNum).padStart(2, '0')}`
                    : 'Premier épisode'}
                </Button>
              )}
              {hasExternalPlayers && directPlayable && (
                <Button
                  size="lg"
                  icon={<ExternalLink className="size-5" />}
                  onClick={() => void openInExternalPlayer(details.streamUrl, nativePlatform === 'ios' ? 'ios-vlc' : 'ask', details.cleanTitle)}
                >
                  {nativePlatform === 'ios' ? 'Ouvrir dans VLC' : 'Autre lecteur'}
                </Button>
              )}
              <Button
                size="lg"
                icon={<Heart className={`size-5 ${isFavorite ? 'fill-accent text-accent' : ''}`} />}
                onClick={() => toggleFavorite(item.id)}
              >
                {isFavorite ? 'Dans ma liste' : 'Ma liste'}
              </Button>
            </div>

            {movieResume && movieResume.duration > 0 && directPlayable && (
              <ProgressLine value={(movieResume.currentTime / movieResume.duration) * 100} className="mt-5 h-1.5 max-w-sm" />
            )}

            {details.overview ? (
              <p className="mt-8 max-w-2xl text-lg leading-relaxed text-mist">{details.overview}</p>
            ) : (
              !loading && <p className="mt-8 text-fog">Pas de résumé disponible pour ce titre.</p>
            )}

            {(details.director || details.cast) && (
              <dl className="mt-6 grid max-w-2xl gap-2 text-sm">
                {details.director && (
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0 text-fog">Réalisation</dt>
                    <dd className="text-mist">{details.director}</dd>
                  </div>
                )}
                {details.cast && (
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0 text-fog">Avec</dt>
                    <dd className="line-clamp-2 text-mist">{details.cast}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>

        {/* Saisons et épisodes */}
        {isXtreamSeries && (
          <section className="mt-14">
            <h2 className="font-wide text-2xl font-bold tracking-tight">Épisodes</h2>
            {episodesError && <p className="mt-4 text-onair">{episodesError}</p>}
            {!seasons && !episodesError && <BrandMark pulse className="mt-6 h-12" />}
            {seasons && seasons.length === 0 && <p className="mt-4 text-mist">Le fournisseur ne liste aucun épisode pour cette série.</p>}
            {seasons && seasons.length > 1 && (
              <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
                {seasons.map((s) => (
                  <Chip key={s.season} selected={s.season === season} count={s.episodes.length} onClick={() => setSeason(s.season)}>
                    Saison {s.season}
                  </Chip>
                ))}
              </div>
            )}
            {currentSeason && (
              <ol className="mt-6 grid gap-2">
                {currentSeason.episodes.map((ep) => {
                  const point = vodResumePoints[`${item.id}_ep_${ep.id}`]
                  return (
                    <li key={ep.id}>
                      <button
                        type="button"
                        onClick={() => playVod(details, { episode: ep })}
                        className="tile tile-frame tile-flat flex w-full items-center gap-5 rounded-2xl bg-ink-900/80 p-3 pr-5 text-left ring-1 ring-white/5 hover:bg-ink-850"
                      >
                        <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                          {ep.image ? (
                            <img src={ep.image} alt="" loading="lazy" className="size-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold text-fog">
                              {String(ep.episodeNum).padStart(2, '0')}
                            </span>
                          )}
                          {point?.duration ? (
                            <ProgressLine value={(point.currentTime / point.duration) * 100} className="absolute inset-x-2 bottom-2 h-[3px]" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">
                            <span className="mr-3 font-mono text-sm text-accent tabular">É{String(ep.episodeNum).padStart(2, '0')}</span>
                            {ep.title}
                          </p>
                          {ep.plot && <p className="mt-1 line-clamp-2 text-sm text-mist">{ep.plot}</p>}
                        </div>
                        {ep.duration && <span className="hidden shrink-0 font-mono text-sm text-fog sm:block">{ep.duration}</span>}
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default VodDetail
