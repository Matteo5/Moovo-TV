import React, { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import type { Channel, VodItem } from '../types/iptv'
import type { BrowseItem } from './TvBrowse'
import { tmdbService } from '../services/tmdbService'
import { categoryLabel, channelCategory } from '../services/categoryService'
import { useUpcoming } from '../hooks/useUpcoming'
import { useNow } from '../hooks/useNow'
import { ChannelLogo } from '../ui/ChannelLogo'
import { OnAirDot, ProgressLine, formatTime, programProgress } from '../ui/Program'

/**
 * Haut de l'écran TV : le titre sélectionné en grand (comme le panneau d'aperçu de Netflix / Prime Video).
 * Le texte suit la télécommande instantanément ; l'image de fond n'est changée qu'une fois la sélection
 * posée (≈ 0,3 s), en fondu, pour ne pas décoder une image à chaque appui sur un petit boîtier.
 */

// Les boîtiers TV affichent en 1080p au mieux : un fond TMDB en 780 px suffit et pèse trois fois moins
const small = (url?: string) => url?.replace('/w1280/', '/w780/')

// Fonds TMDB déjà trouvés pour les titres sans image du fournisseur (session en cours)
const extraBackdrops = new Map<string, string | null>()

function formatRuntime(item: VodItem): string | undefined {
  if (item.duration && item.duration > 0) {
    const h = Math.floor(item.duration / 3600)
    const m = Math.round((item.duration % 3600) / 60)
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
  }
  return item.runtime || undefined
}

function useBackdrop(item: BrowseItem | undefined): string | undefined {
  const vod = item?.kind === 'vod' ? item : null
  const direct = vod ? small(vod.backdrop || vod.item.backdrop) : undefined
  const [found, setFound] = useState<string | undefined>(undefined)

  useEffect(() => {
    setFound(undefined)
    if (!vod || direct || !tmdbService.isConfigured()) return
    const id = vod.item.id
    if (extraBackdrops.has(id)) {
      setFound(extraBackdrops.get(id) || undefined)
      return
    }
    // Sélection posée depuis un moment seulement : pas une requête par appui sur la télécommande
    let alive = true
    const timer = window.setTimeout(() => {
      void tmdbService.searchMedia(vod.item.name, vod.item.type === 'movie' ? 'movie' : 'tv').then((meta) => {
        const url = small(meta?.backdrop) || null
        extraBackdrops.set(id, url)
        if (alive) setFound(url || undefined)
      })
    }, 700)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vod?.item.id, direct])

  return direct || found
}

/** Image de fond en fondu enchaîné : l'ancienne reste affichée jusqu'à ce que la nouvelle soit décodée. */
const Backdrop: React.FC<{ src?: string }> = ({ src }) => {
  const [settled, setSettled] = useState<string | undefined>(src)
  const [shown, setShown] = useState<string | undefined>(src)
  const [incoming, setIncoming] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(src), 280)
    return () => window.clearTimeout(timer)
  }, [src])

  useEffect(() => {
    if (settled === shown) return
    if (!settled) {
      setShown(undefined)
      setIncoming(null)
    } else setIncoming(settled)
  }, [settled, shown])

  return (
    <div className={`tvb-backdrop transition-opacity duration-500 ${shown || incoming ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
      {shown && <img src={shown} alt="" decoding="async" className="absolute inset-0 size-full object-cover object-[center_22%]" />}
      {incoming && incoming !== shown && (
        <img
          key={incoming}
          src={incoming}
          alt=""
          decoding="async"
          onLoad={(e) => e.currentTarget.classList.add('tvb-in')}
          onTransitionEnd={() => {
            setShown(incoming)
            setIncoming(null)
          }}
          onError={() => setIncoming(null)}
          className="tvb-fade absolute inset-0 size-full object-cover object-[center_22%]"
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-ink-950)_0%,rgb(3_9_25/0.88)_24%,rgb(3_9_25/0.35)_55%,rgb(3_9_25/0.05)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink-950 via-ink-950/75 to-transparent" />
    </div>
  )
}

const Meta: React.FC<{ parts: (React.ReactNode | false | undefined | null)[] }> = ({ parts }) => (
  <p className="mt-[0.55rem] flex flex-wrap items-center gap-x-[0.6rem] gap-y-[0.2rem] text-[0.78rem] font-semibold text-mist">
    {parts.filter(Boolean).map((p, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="text-fog">·</span>}
        {p}
      </React.Fragment>
    ))}
  </p>
)

const VodInfo: React.FC<{ entry: Extract<BrowseItem, { kind: 'vod' }>; billboard: boolean }> = ({ entry, billboard }) => {
  const { item } = entry
  const genre = item.genres?.slice(0, 2).join(', ') || (item.category ? categoryLabel(item.category) : undefined)
  return (
    <>
      <p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.2em] text-accent">{item.type === 'movie' ? 'Film' : 'Série'}</p>
      <h1 className={`mt-[0.3rem] font-xwide font-extrabold leading-[0.98] tracking-tight text-paper text-balance line-clamp-2 ${billboard ? 'text-[2.5rem]' : 'text-[2rem]'}`}>
        {item.cleanTitle}
      </h1>
      <Meta
        parts={[
          item.rating ? (
            <span key="note" className="inline-flex items-center gap-[0.25rem] text-paper">
              <Star className="size-[0.75rem] fill-brand-yellow text-brand-yellow" />
              {item.rating.toFixed(1)}
            </span>
          ) : null,
          item.year,
          genre,
          formatRuntime(item),
          entry.progress ? <span key="reprise" className="text-onair">Reprendre à {Math.round(entry.progress)} %</span> : null,
        ]}
      />
      {item.overview && <p className="mt-[0.7rem] max-w-[27rem] text-[0.8rem] leading-relaxed text-mist line-clamp-3">{item.overview}</p>}
    </>
  )
}

const ChannelInfo: React.FC<{ channel: Channel; billboard: boolean }> = ({ channel, billboard }) => {
  const now = useNow(30_000)
  const upcoming = useUpcoming(channel, 2)
  const program = upcoming.find((p) => p.start.getTime() <= now && p.stop.getTime() > now) || channel.currentProgram
  const next = upcoming.find((p) => p.start.getTime() > now)
  return (
    <>
      <div className="flex items-center gap-[0.8rem]">
        <OnAirDot className="text-[0.6rem]" />
        {channel.number ? <span className="font-mono text-[0.7rem] font-bold text-accent tabular">CH {String(channel.number).padStart(3, '0')}</span> : null}
        <span className="text-[0.7rem] font-semibold text-fog">{categoryLabel(channelCategory(channel))}</span>
      </div>
      <h1 className={`mt-[0.35rem] font-xwide font-extrabold leading-[0.98] tracking-tight text-paper line-clamp-1 ${billboard ? 'text-[2.5rem]' : 'text-[2rem]'}`}>
        {channel.name}
      </h1>
      {program ? (
        <div className="mt-[0.7rem] max-w-[24rem]">
          <p className="truncate text-[1rem] font-semibold text-paper">{program.title}</p>
          <div className="mt-[0.4rem] flex items-center gap-[0.6rem] font-mono text-[0.65rem] text-mist tabular">
            <span>{formatTime(program.start)}</span>
            <ProgressLine value={programProgress(program, now)} className="h-[0.15rem] flex-1" />
            <span>{formatTime(program.stop)}</span>
          </div>
          {next && (
            <p className="mt-[0.5rem] truncate text-[0.72rem] text-fog">
              Ensuite <span className="font-mono tabular">{formatTime(next.start)}</span> <span className="text-mist">{next.title}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="mt-[0.7rem] text-[0.8rem] text-fog">Programme non communiqué par la chaîne</p>
      )}
    </>
  )
}

export const Spotlight: React.FC<{ item?: BrowseItem; billboard: boolean; label?: string; actions?: React.ReactNode }> = ({
  item,
  billboard,
  label,
  actions,
}) => {
  const backdrop = useBackdrop(item)
  const vod = item?.kind === 'vod' ? item : null
  const poster = vod && !backdrop ? vod.poster || vod.item.logo : undefined

  return (
    <div className={`tvb-spot absolute inset-x-0 top-0 ${billboard ? 'tvb-spot-big' : ''}`}>
      <Backdrop src={backdrop} />

      {/* Sans image de fond : l'affiche (film) ou le logo (chaîne) à droite, sur un halo discret */}
      {!backdrop && item && item.kind !== 'more' && (
        <div className="absolute right-[var(--gutter)] top-[2.4rem] flex h-[calc(100%-4rem)] items-center" aria-hidden>
          <div className="absolute -inset-[4rem] bg-[radial-gradient(closest-side,rgb(155_107_255/0.22),transparent)]" />
          {item.kind === 'channel' ? (
            <div className="relative aspect-video h-[78%] overflow-hidden rounded-[1rem] bg-ink-900 ring-1 ring-white/8">
              <ChannelLogo logo={item.channel.logo} name={item.channel.name} className="absolute inset-0 m-auto h-[52%] w-[52%] bg-transparent" />
              <div className="streak absolute inset-x-0 bottom-0 h-[0.2rem]" />
            </div>
          ) : poster ? (
            <img key={poster} src={poster} alt="" decoding="async" className="relative aspect-[2/3] h-[92%] rounded-[0.8rem] object-cover ring-1 ring-white/10" />
          ) : null}
        </div>
      )}

      <div className="relative z-10 flex h-full max-w-[34rem] flex-col justify-end pb-[1.2rem] pl-[var(--gutter)]">
        {label && (
          <span className="mb-[0.7rem] inline-flex w-fit items-center rounded-full streak px-[0.6rem] py-[0.15rem] font-display text-[0.6rem] font-extrabold text-ink-950">
            {label}
          </span>
        )}
        {item?.kind === 'vod' && <VodInfo entry={item} billboard={billboard} />}
        {item?.kind === 'channel' && <ChannelInfo channel={item.channel} billboard={billboard} />}
        {item?.kind === 'more' && (
          <>
            <p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.2em] text-accent">Catalogue</p>
            <h1 className="mt-[0.3rem] font-xwide text-[2rem] font-extrabold leading-[0.98] text-paper">{item.label}</h1>
            {item.count ? <p className="mt-[0.6rem] text-[0.8rem] text-mist">{item.count.toLocaleString('fr-FR')} titres · OK pour tout parcourir</p> : null}
          </>
        )}
        {actions && (
          <div data-billboard className="mt-[1.1rem] flex gap-[0.6rem]">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
