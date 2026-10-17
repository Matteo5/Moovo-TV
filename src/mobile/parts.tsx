import React, { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import type { VodItem } from '../types/iptv'
import { useIptvStore } from '../store/useIptvStore'
import { categoryLabel } from '../services/categoryService'

/* ─── Couleurs de la traînée du M ─────────────────────────────── */

const TRAIL = ['#1ec8ff', '#5aa6ff', '#9b6bff', '#c95ad6', '#ff3ea5', '#ff5f6c', '#ff8a1f', '#ffab2c', '#ffd23f', '#ffe27a']

/** Couleur du rang n (1 → cyan, 10 → jaune) : le Top 10 parcourt la traînée du logo. */
export function rankColor(rank: number): string {
  return TRAIL[Math.min(TRAIL.length - 1, Math.max(0, rank - 1))]
}

/* ─── Ouverture d'une fiche ───────────────────────────────────── */

type ViewTransitionDocument = Document & { startViewTransition?: (cb: () => void) => unknown }

/**
 * Ouvre la fiche d'un titre. Là où le navigateur sait faire une transition de vue (iOS 18+),
 * l'affiche touchée devient l'affiche de la fiche ; ailleurs, la fiche monte simplement.
 */
export function openDetail(item: VodItem, source?: HTMLElement | null) {
  const open = () => useIptvStore.getState().openVodDetail(item)
  const doc = document as ViewTransitionDocument
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  // Depuis une fiche déjà ouverte (« Dans le même genre »), l'affiche de la fiche porte déjà le nom de transition
  // Page non affichée : le navigateur reporterait la transition, et la fiche avec elle
  const hidden = document.visibilityState !== 'visible'
  if (!source || !doc.startViewTransition || reduce || hidden || useIptvStore.getState().vodDetail) {
    open()
    return
  }
  source.style.viewTransitionName = 'm-poster'
  let done = false
  const update = () => {
    if (done) return
    done = true
    source.style.viewTransitionName = ''
    flushSync(open)
  }
  const transition = doc.startViewTransition(update) as { skipTransition?: () => void } | undefined
  // Filet de sécurité : si le navigateur diffère la transition (rendu suspendu), la fiche s'ouvre quand même
  window.setTimeout(() => {
    if (done) return
    try {
      transition?.skipTransition?.()
    } catch {
      // Transition déjà terminée
    }
    update()
  }, 350)
}

/* ─── Défilement ──────────────────────────────────────────────── */

/** Vrai dès que la page a défilé de plus de `threshold` px (barre compacte, voile du haut). */
export function useScrolledPast(threshold: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return past
}

/* ─── Images ──────────────────────────────────────────────────── */

/** Image avec repli : essaie chaque source, puis affiche le titre posé sur la nuit du logo. */
export const Artwork: React.FC<{
  sources: (string | undefined)[]
  title: string
  className?: string
  imgClassName?: string
  eager?: boolean
  titleSize?: 'sm' | 'md' | 'lg'
}> = ({ sources, title, className = '', imgClassName = '', eager, titleSize = 'md' }) => {
  const list = sources.filter(Boolean) as string[]
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const src = list[attempt]
  return (
    <div className={`relative overflow-hidden bg-ink-850 ${className}`}>
      {src ? (
        <img
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            setAttempt((a) => a + 1)
          }}
          className={`size-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      ) : (
        <div className="flex size-full flex-col justify-end bg-[linear-gradient(165deg,var(--color-ink-700),var(--color-ink-900)_70%)] p-3">
          <span
            className={`m-heading text-paper ${titleSize === 'lg' ? 'text-3xl' : titleSize === 'sm' ? 'text-sm' : 'text-lg'} line-clamp-4 break-words`}
          >
            {title}
          </span>
        </div>
      )}
    </div>
  )
}

/** Barre de progression de reprise : la traînée du M qui se révèle au fil du film. */
export const TrailProgress: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`h-[3px] overflow-hidden rounded-full bg-white/20 ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className="streak h-full rounded-full" style={{ width: `${Math.max(3, Math.round(value))}%`, backgroundSize: `${10000 / Math.max(value, 1)}% 100%` }} />
  </div>
)

/* ─── Affiches ────────────────────────────────────────────────── */

export function metaLine(item: VodItem): string {
  return [item.year, item.category && categoryLabel(item.category)].filter(Boolean).join(' · ')
}

/** Affiche 2:3 d'une rangée ou d'une grille, titre dessous. */
export const Poster: React.FC<{
  item: VodItem
  poster?: string
  progress?: number
  className?: string
  showTitle?: boolean
}> = React.memo(({ item, poster, progress, className = 'w-[7.75rem]', showTitle = true }) => (
  <button
    type="button"
    onClick={(e) => openDetail(item, e.currentTarget.querySelector<HTMLElement>('[data-art]'))}
    className={`m-press shrink-0 text-left ${className}`}
    aria-label={item.cleanTitle}
  >
    <div data-art className="relative overflow-hidden rounded-[0.9rem]">
      <Artwork sources={[poster, item.logo]} title={item.cleanTitle} className="aspect-[2/3]" titleSize="sm" />
      {progress !== undefined && progress > 0 && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 to-transparent px-2 pb-2 pt-5">
          <TrailProgress value={progress} />
        </div>
      )}
    </div>
    {showTitle && (
      <>
        <p className="mt-2 truncate text-[0.82rem] font-semibold leading-tight text-paper">{item.cleanTitle}</p>
        <p className="truncate text-[0.74rem] text-fog">{item.year || (item.category && categoryLabel(item.category))}</p>
      </>
    )}
  </button>
))
Poster.displayName = 'Poster'

/**
 * Tuile de mosaïque. `lead` et `poster` : l'affiche entière en 2:3 (son titre imprimé reste lisible) ;
 * `small` et `wide` : l'image de fond, avec le titre posé en capitales Montserrat comme sur une affiche.
 * `rank` imprime le rang réel (tendance ou note) en chiffre au trait, de la couleur de sa place sur la traînée.
 */
export const WallTile: React.FC<{
  item: VodItem
  poster?: string
  backdrop?: string
  className?: string
  size: 'lead' | 'small' | 'wide' | 'poster'
  rank?: number
  eager?: boolean
}> = ({ item, poster, backdrop, className = '', size, rank, eager }) => {
  const landscape = size === 'small' || size === 'wide'
  const sources = landscape ? [backdrop, item.backdrop, poster, item.logo] : [poster, item.logo, backdrop]
  // Une affiche porte déjà son titre imprimé : on ne le répète que sur une image de fond (sans texte)
  const first = sources.find(Boolean)
  const showTitle = !first || first === (backdrop || item.backdrop)
  return (
    <button
      type="button"
      onClick={(e) => openDetail(item, e.currentTarget.querySelector<HTMLElement>('[data-art]'))}
      className={`m-press relative block overflow-hidden rounded-[1.125rem] text-left ${className}`}
      aria-label={rank ? `N°${rank} : ${item.cleanTitle}` : item.cleanTitle}
    >
      <div data-art className="absolute inset-0">
        <Artwork sources={sources} title="" className="size-full" eager={eager} />
      </div>
      <div className={`absolute inset-0 ${showTitle ? 'bg-[linear-gradient(180deg,transparent_40%,rgb(3_9_25/0.92))]' : 'bg-[linear-gradient(180deg,transparent_72%,rgb(3_9_25/0.9))]'}`} />
      {rank ? (
        <span
          aria-hidden="true"
          className={`m-rank absolute left-2.5 top-1.5 select-none drop-shadow-[0_0.25rem_0.75rem_rgb(0_0_0/0.6)] ${size === 'lead' ? 'text-[5.5rem]' : 'text-[3.6rem]'}`}
          style={{ '--rank': rankColor(rank), color: 'rgb(3 9 25 / 0.35)' } as React.CSSProperties}
        >
          {rank}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-3">
        {showTitle && (
          <p className={`m-display uppercase text-paper ${size === 'lead' ? 'text-[1.7rem] line-clamp-3' : size === 'wide' ? 'text-[1.65rem] line-clamp-2' : 'text-[1.15rem] line-clamp-3'}`}>
            {item.cleanTitle}
          </p>
        )}
        {size === 'lead' && (
          <p className="mt-1.5 flex items-center gap-2 text-[0.78rem] text-mist">
            {item.rating ? (
              <span className="inline-flex items-center gap-1 font-semibold text-paper">
                <Star className="size-3 fill-brand-yellow text-brand-yellow" />
                {item.rating.toFixed(1)}
              </span>
            ) : null}
            <span className="truncate">{metaLine(item)}</span>
          </p>
        )}
      </div>
    </button>
  )
}

export interface WallEntry {
  item: VodItem
  poster?: string
  backdrop?: string
  rank?: number
}

/**
 * Mur d'affiches : la mosaïque qui donne son nom à la direction. Trois formes pour que deux collections
 * voisines ne se ressemblent jamais :
 *  - `lead` : une affiche entière sur deux rangs, deux images à côté (`flip` inverse les côtés) ;
 *  - `wide` : une large image de fond, trois affiches dessous ;
 *  - `quad` : quatre affiches en carré.
 */
export const Wall: React.FC<{ entries: WallEntry[]; shape?: 'lead' | 'wide' | 'quad'; flip?: boolean; eager?: boolean }> = ({
  entries,
  shape = 'lead',
  flip,
  eager,
}) => {
  const [a, b, c, d] = entries
  if (!a) return null
  if (shape === 'wide' && d) {
    return (
      <div className="grid grid-cols-3 gap-2.5 px-[var(--m-gutter)]">
        <WallTile {...a} size="wide" eager={eager} className="col-span-3 aspect-[16/9]" />
        {[b, c, d].map((e) => (
          <WallTile key={e.item.id} {...e} size="poster" eager={eager} className="aspect-[2/3]" />
        ))}
      </div>
    )
  }
  if (shape === 'quad' && d) {
    return (
      <div className="grid grid-cols-2 gap-2.5 px-[var(--m-gutter)]">
        {[a, b, c, d].map((e) => (
          <WallTile key={e.item.id} {...e} size="poster" eager={eager} className="aspect-[2/3]" />
        ))}
      </div>
    )
  }
  if (!b) {
    return (
      <div className="px-[var(--m-gutter)]">
        <WallTile {...a} size="lead" eager={eager} className="mx-auto aspect-[2/3] w-2/3" />
      </div>
    )
  }
  // La grande affiche garde son format 2:3 : c'est elle qui donne la hauteur du mur, les deux images se la partagent
  return (
    <div className={`grid grid-rows-2 gap-2.5 px-[var(--m-gutter)] ${flip ? 'grid-cols-[1fr_1.3fr]' : 'grid-cols-[1.3fr_1fr]'}`}>
      <WallTile {...a} size="lead" eager={eager} className={`row-span-2 row-start-1 aspect-[2/3] ${flip ? 'col-start-2' : 'col-start-1'}`} />
      <WallTile {...b} size="small" eager={eager} className={`row-start-1 min-h-0 ${flip ? 'col-start-1' : 'col-start-2'}`} />
      {c && <WallTile {...c} size="small" eager={eager} className={`row-start-2 min-h-0 ${flip ? 'col-start-1' : 'col-start-2'}`} />}
    </div>
  )
}

/* ─── En-têtes ────────────────────────────────────────────────── */

/** Titre de collection : le titre parle seul, l'action « Tout voir » à droite. */
export const SectionTitle: React.FC<{ title: string; detail?: string; onMore?: () => void; className?: string }> = ({
  title,
  detail,
  onMore,
  className = '',
}) => (
  <div className={`flex items-end justify-between gap-4 px-[var(--m-gutter)] ${className}`}>
    <div className="min-w-0">
      <h2 className="m-heading text-[1.45rem] text-paper text-balance">{title}</h2>
      {detail && <p className="mt-1 text-[0.82rem] text-fog">{detail}</p>}
    </div>
    {onMore && (
      <button type="button" onClick={onMore} className="m-press -mr-1.5 flex shrink-0 items-center gap-0.5 rounded-full py-1 pl-2 pr-1 text-[0.85rem] font-semibold text-mist">
        Tout voir <ChevronRight className="size-4" />
      </button>
    )}
  </div>
)

/**
 * Grand titre de page façon iOS ; au défilement, une barre compacte floutée prend le relais en haut.
 * `leading` remplace le titre compact (bouton Retour), `trailing` porte les actions de la page.
 */
export const LargeTitle: React.FC<{
  title: string
  detail?: React.ReactNode
  trailing?: React.ReactNode
  onBack?: () => void
  backLabel?: string
}> = ({ title, detail, trailing, onBack, backLabel = 'Retour' }) => {
  const compact = useScrolledPast(56)
  return (
    <>
      <div
        className={`fixed inset-x-0 top-0 z-30 transition-[opacity,background-color] duration-300 ${compact ? 'm-bar opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!compact}
      >
        <div className="flex h-[calc(2.9rem+env(safe-area-inset-top))] items-end justify-center px-14 pb-2.5">
          <p className="truncate font-display text-[0.98rem] font-bold text-paper">{title}</p>
        </div>
        <div className="h-px bg-white/8" />
      </div>
      <header className="px-[var(--m-gutter)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex h-11 items-center justify-between">
          {onBack ? (
            <button type="button" onClick={onBack} className="m-press -ml-2 flex items-center gap-0.5 rounded-full py-1.5 pr-3 text-[0.95rem] font-semibold text-mist">
              <ChevronLeft className="size-6" /> {backLabel}
            </button>
          ) : (
            <span />
          )}
          <div className="fixed right-[var(--m-gutter)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex items-center gap-2">{trailing}</div>
        </div>
        <h1 className="m-display mt-1 text-[2.6rem] text-paper">{title}</h1>
        {detail && <div className="mt-2 text-[0.88rem] text-mist">{detail}</div>}
      </header>
    </>
  )
}

/** Bouton rond des barres (profil, guide, réglages). */
export const BarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({ label, children, className = '', ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`m-press m-bar flex size-10 items-center justify-center rounded-full text-paper ring-1 ring-white/10 ${className}`}
    {...rest}
  >
    {children}
  </button>
)

/** Pastilles de filtre défilantes (genres, univers, saisons). */
export function Pills<T extends string | number>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  options: { id: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
  className?: string
  ariaLabel: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`m-rail gap-2 py-1 ${className}`}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`m-press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.86rem] font-semibold transition-colors ${
              on ? 'bg-paper text-ink-950' : 'bg-white/[0.07] text-mist'
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className={`font-mono text-[0.7rem] tabular ${on ? 'text-ink-600' : 'text-fog'}`}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Top 10 : le mouvement signature ─────────────────────────── */

/** Rangée du Top 10 : chiffres géants au trait, de la couleur de leur place sur la traînée du M. */
export const TopTen: React.FC<{ items: { item: VodItem; poster?: string; rank?: number }[] }> = ({ items }) => (
  <div className="m-rail gap-3 pb-1">
    {items.slice(0, 10).map(({ item, poster, rank: given }, i) => {
      // Rang fourni (suite d'un podium) ou position dans la rangée
      const rank = given ?? i + 1
      return (
        <button
          key={item.id}
          type="button"
          onClick={(e) => openDetail(item, e.currentTarget.querySelector<HTMLElement>('[data-art]'))}
          className="m-press flex shrink-0 items-end"
          aria-label={`N°${rank} : ${item.cleanTitle}`}
        >
          <span
            aria-hidden="true"
            className={`m-rank relative z-0 select-none ${rank === 10 ? 'text-[6.2rem] -mr-3' : 'text-[7.6rem] -mr-2.5'}`}
            style={{ '--rank': rankColor(rank) } as React.CSSProperties}
          >
            {rank}
          </span>
          <div data-art className="relative z-10 w-[5.9rem] overflow-hidden rounded-[0.9rem] shadow-[0_1rem_2rem_-0.75rem_rgb(0_0_0/0.8)]">
            <Artwork sources={[poster, item.logo]} title={item.cleanTitle} className="aspect-[2/3]" titleSize="sm" />
          </div>
        </button>
      )
    })}
  </div>
)
