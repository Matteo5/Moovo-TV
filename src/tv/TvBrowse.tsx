import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Channel, VodItem } from '../types/iptv'
import { ChannelLogo } from '../ui/ChannelLogo'
import { ChannelNumber, ProgressLine, programProgress } from '../ui/Program'
import { Spotlight } from './Spotlight'

/**
 * Accueil « à la Netflix / Prime Video » pour téléviseur.
 *
 * - En haut, le spotlight montre en grand le titre sélectionné (image de fond, infos, résumé).
 * - Dessous, des rangées : la rangée active reste toujours à la même hauteur et la tuile active
 *   toujours à gauche ; ce sont les rangées qui glissent (transform uniquement, rien à mesurer).
 * - Chaque rangée retient sa position quand on la quitte, comme sur Netflix.
 * - Seules les tuiles proches de l'écran sont rendues : quelques dizaines d'éléments au plus,
 *   même avec un catalogue de 20 000 titres (boîtiers Android TV peu puissants).
 * - La navigation des rangées est gérée ici (pas par la navigation spatiale générale) ; Gauche sur la
 *   première tuile rend la main au menu, Haut sur la première rangée remonte au billboard.
 */

export type BrowseItem =
  | {
      kind: 'vod'
      key: string
      item: VodItem
      /** Affiche de meilleure qualité (TMDB) */
      poster?: string
      backdrop?: string
      /** Rang dans les tendances de la semaine */
      rank?: number
      /** Avancement de la reprise (0-100) */
      progress?: number
    }
  | { kind: 'channel'; key: string; channel: Channel }
  | { kind: 'more'; key: string; label: string; count?: number; onOpen: () => void }

export type RowVariant = 'poster' | 'top10' | 'landscape' | 'channel'

export interface BrowseRow {
  key: string
  title: string
  variant: RowVariant
  items: BrowseItem[]
}

export interface BrowseActions {
  onOpen: (item: BrowseItem) => void
}

/** Dimensions en rem : tout s'adapte à la taille de police du mode TV (1,6 vw). */
const SIZES: Record<RowVariant, { w: number; h: number; gap: number }> = {
  poster: { w: 6.4, h: 9.6, gap: 0.75 },
  top10: { w: 9.4, h: 9.6, gap: 0.75 },
  landscape: { w: 12.2, h: 6.86, gap: 0.75 },
  channel: { w: 10.4, h: 5.85, gap: 0.75 },
}
const ROW_TITLE = 2.3
const ROW_PAD = 1.5
const rowHeight = (v: RowVariant) => ROW_TITLE + SIZES[v].h + ROW_PAD

// Tuiles rendues autour de la position de chaque rangée
const BEFORE = 2
const AFTER = 9
// Touche maintenue : cadence plafonnée pour ne pas prendre de retard sur un petit processeur
const REPEAT_MS = 110

const tileKey = (row: number, col: number) => `${row}:${col}`

let lastMoveAt = 0
/** Touche maintenue : vrai si l'appui précédent est trop récent (on l'ignore). */
function repeatTooSoon(): boolean {
  const now = performance.now()
  if (now - lastMoveAt < REPEAT_MS) return true
  lastMoveAt = now
  return false
}

// ── Tuiles ───────────────────────────────────────────────────

const VodArt: React.FC<{ item: VodItem; src?: string; landscape?: boolean }> = ({ item, src, landscape }) => {
  const sources = useMemo(() => [src, item.logo].filter(Boolean) as string[], [src, item.logo])
  const [attempt, setAttempt] = useState(0)
  const current = sources[attempt]
  if (!current) {
    return (
      <div className="flex size-full flex-col justify-end bg-[linear-gradient(160deg,var(--color-ink-800),var(--color-ink-900))] p-[0.6rem]">
        <span className={`font-wide font-bold leading-tight text-paper ${landscape ? 'text-[0.85rem] line-clamp-2' : 'text-[0.8rem] line-clamp-4'}`}>
          {item.cleanTitle}
        </span>
        <span className="streak mt-[0.4rem] h-[0.15rem] w-[1.6rem] rounded-full" />
      </div>
    )
  }
  return (
    <img
      src={current}
      alt=""
      decoding="async"
      draggable={false}
      onError={() => setAttempt((a) => a + 1)}
      className="size-full object-cover"
    />
  )
}

const Tile: React.FC<{ entry: BrowseItem; variant: RowVariant; row: number; col: number; onOpen: (item: BrowseItem) => void }> =
  React.memo(({ entry, variant, row, col, onOpen }) => {
    const size = SIZES[variant]
    const style: React.CSSProperties = { left: `${col * (size.w + size.gap)}rem`, width: `${size.w}rem`, height: `${size.h}rem` }
    const common = {
      type: 'button' as const,
      'data-tile': tileKey(row, col),
      onClick: () => onOpen(entry),
      style,
      className: 'tvb-tile absolute top-0',
    }

    if (entry.kind === 'more') {
      return (
        <button {...common} aria-label={`${entry.label}${entry.count ? `, ${entry.count} titres` : ''}`}>
          <span className="tvb-frame flex size-full flex-col items-start justify-end rounded-[0.6rem] bg-ink-850 p-[0.8rem] ring-1 ring-white/8">
            <ChevronRight className="size-[1.6rem] text-accent" />
            <span className="mt-[0.3rem] font-wide text-[0.85rem] font-bold leading-tight text-paper">{entry.label}</span>
            {entry.count ? <span className="font-mono text-[0.6rem] text-fog tabular">{entry.count.toLocaleString('fr-FR')} titres</span> : null}
          </span>
        </button>
      )
    }

    if (entry.kind === 'channel') {
      const { channel } = entry
      const program = channel.currentProgram
      return (
        <button {...common} aria-label={channel.name}>
          <span className="tvb-frame relative block size-full overflow-hidden rounded-[0.6rem] bg-ink-850 ring-1 ring-white/6">
            <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgb(255_255_255/0.08),transparent_60%)]" />
            <ChannelLogo logo={channel.logo} name={channel.name} className="absolute inset-0 m-auto h-[58%] w-[58%] bg-transparent" />
            <ChannelNumber value={channel.number} className="absolute left-[0.5rem] top-[0.35rem] text-[0.55rem] text-mist" />
            {program && <ProgressLine value={programProgress(program)} className="absolute inset-x-[0.5rem] bottom-[0.45rem] h-[0.12rem]" />}
          </span>
        </button>
      )
    }

    const { item } = entry
    if (variant === 'top10') {
      return (
        <button {...common} aria-label={`N°${entry.rank} ${item.cleanTitle}`}>
          <span aria-hidden className="tvb-rank absolute bottom-[-0.35rem] left-0 font-display text-[7.2rem] font-black leading-none tracking-[-0.08em]">
            {entry.rank}
          </span>
          <span className="tvb-frame absolute right-0 top-0 block h-full w-[6.4rem] overflow-hidden rounded-[0.6rem] bg-ink-850">
            <VodArt item={item} src={entry.poster} />
          </span>
        </button>
      )
    }

    const landscape = variant === 'landscape'
    return (
      <button {...common} aria-label={item.cleanTitle}>
        <span className="tvb-frame relative block size-full overflow-hidden rounded-[0.6rem] bg-ink-850">
          <VodArt item={item} src={landscape ? entry.backdrop || item.backdrop || entry.poster : entry.poster} landscape={landscape} />
          {landscape && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent px-[0.6rem] pb-[0.5rem] pt-[1.6rem] text-left">
              <span className="block truncate text-[0.7rem] font-bold text-paper">{item.cleanTitle}</span>
            </span>
          )}
          {entry.progress !== undefined && entry.progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-[0.16rem] bg-white/20">
              <span className="block h-full bg-onair" style={{ width: `${Math.round(entry.progress)}%` }} />
            </span>
          )}
        </span>
      </button>
    )
  })
Tile.displayName = 'Tile'

const Row: React.FC<{
  row: BrowseRow
  index: number
  col: number
  active: boolean
  rendered: boolean
  fast: boolean
  /** Largeur disponible pour les tuiles (rem) */
  avail: number
  onOpen: (item: BrowseItem) => void
}> = React.memo(({ row, index, col, active, rendered, fast, avail, onOpen }) => {
  const size = SIZES[row.variant]
  const step = size.w + size.gap
  // La tuile active se cale à gauche ; en fin de rangée, les dernières tuiles remplissent l'écran
  const shift = Math.min(col * step, Math.max(0, row.items.length * step - size.gap - avail))
  const from = Math.max(0, col - BEFORE)
  const to = Math.min(row.items.length, col + AFTER + 1)
  return (
    <section style={{ height: `${rowHeight(row.variant)}rem` }} className="relative" aria-label={row.title}>
      <h2
        className={`flex h-[2.3rem] items-center gap-[0.6rem] pl-[var(--gutter)] font-wide text-[0.95rem] font-bold tracking-tight ${
          active ? 'text-paper' : 'text-mist/70'
        }`}
      >
        {row.title}
        {active && row.items.length > 1 && (
          <span className="font-mono text-[0.6rem] font-medium text-fog tabular">
            {col + 1} / {row.items.length}
          </span>
        )}
      </h2>
      {rendered && (
        <div
          className={`tvb-track absolute left-[var(--gutter)] ${fast ? 'tvb-fast' : ''}`}
          style={{ top: `${ROW_TITLE}rem`, height: `${size.h}rem`, transform: `translate3d(-${shift}rem,0,0)` }}
        >
          {row.items.slice(from, to).map((entry, i) => (
            <Tile key={entry.key} entry={entry} variant={row.variant} row={index} col={from + i} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  )
})
Row.displayName = 'Row'

// ── Écran complet ────────────────────────────────────────────

/** Largeur de l'écran disponible pour une rangée, en rem (menu et marges déduits). */
function measureAvailable(): number {
  const root = document.documentElement
  const style = getComputedStyle(root)
  const rem = parseFloat(style.fontSize) || 16
  const rail = parseFloat(style.getPropertyValue('--rail-w')) || 6.25
  const gutter = parseFloat(style.getPropertyValue('--gutter')) || 3
  return window.innerWidth / rem - rail - gutter * 2
}

function useAvailableWidth(): number {
  const [avail, setAvail] = useState(measureAvailable)
  useEffect(() => {
    const onResize = () => setAvail(measureAvailable())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return avail
}

export interface TvBrowseProps {
  rows: BrowseRow[]
  /** Titre mis en avant au-dessus des rangées (boutons Lecture / Plus d'infos) */
  billboard?: BrowseItem
  /** Boutons du billboard */
  billboardActions?: React.ReactNode
  /** Petit libellé au-dessus du titre du billboard (« N°1 des tendances »…) */
  billboardLabel?: string
  onOpen: (item: BrowseItem) => void
  /** Bandeau optionnel sous les rangées (ex. invitation TMDB) */
  empty?: React.ReactNode
}

export const TvBrowse: React.FC<TvBrowseProps> = ({ rows, billboard, billboardActions, billboardLabel, onOpen, empty }) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Position repérée par la clé de la rangée (pas son rang) : si une rangée apparaît au-dessus
  // (« Reprendre » après un film), on reste sur la même rangée. rowKey null = billboard.
  const [focus, setFocus] = useState<{ rowKey: string | null; col: number }>(() => ({
    rowKey: billboard || rows.length === 0 ? null : rows[0].key,
    col: 0,
  }))
  // Position retenue de chaque rangée quittée (Netflix)
  const [colMemory, setColMemory] = useState<Record<string, number>>({})
  const [fast, setFast] = useState(false)
  const pendingFocus = useRef(false)
  const avail = useAvailableWidth()

  const offsets = useMemo(() => {
    const list: number[] = []
    let acc = 0
    for (const r of rows) {
      list.push(acc)
      acc += rowHeight(r.variant)
    }
    return list
  }, [rows])

  // Rangée disparue (catalogue rechargé) : on retombe sur la première, ou sur le billboard
  const found = focus.rowKey === null ? -1 : rows.findIndex((r) => r.key === focus.rowKey)
  const row = focus.rowKey === null ? (billboard || rows.length === 0 ? -1 : 0) : found >= 0 ? found : billboard ? -1 : Math.min(0, rows.length - 1)
  const col = row >= 0 ? Math.min(focus.col, Math.max(0, rows[row].items.length - 1)) : 0
  const current: BrowseItem | undefined = row >= 0 ? rows[row]?.items[col] : billboard

  const colOf = (r: number) => (r === row ? col : Math.min(colMemory[rows[r].key] ?? 0, Math.max(0, rows[r].items.length - 1)))

  const remember = () => {
    if (row >= 0) setColMemory((m) => ({ ...m, [rows[row].key]: col }))
  }

  const moveTo = (r: number, c: number) => {
    if (r !== row) remember()
    pendingFocus.current = true
    setFocus({ rowKey: r >= 0 ? rows[r].key : null, col: c })
  }

  // Remet le focus du DOM sur la position courante (focus perdu : tuile démontée, calque refermé)
  const refocus = () => {
    pendingFocus.current = true
    setFocus((f) => ({ ...f }))
  }

  // Le focus du DOM suit la position (après rendu de la tuile visée)
  useLayoutEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    const root = rootRef.current
    if (!root) return
    const target =
      row < 0
        ? root.querySelector<HTMLElement>('[data-billboard] [data-autofocus]') || root.querySelector<HTMLElement>('[data-billboard] button')
        : root.querySelector<HTMLElement>(`[data-tile="${tileKey(row, col)}"]`)
    target?.focus({ preventScroll: true })
  }, [row, col, focus])

  // Focus arrivé de l'extérieur (menu, retour de fiche) : la position suit
  const onFocusCapture = (e: React.FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tile]')
    if (el) {
      const [r, c] = el.dataset.tile!.split(':').map(Number)
      if ((r !== row || c !== col) && rows[r]) {
        if (r !== row) remember()
        setFocus({ rowKey: rows[r].key, col: c })
      }
    } else if ((e.target as HTMLElement).closest('[data-billboard]') && row !== -1) {
      remember()
      setFocus({ rowKey: null, col: 0 })
    }
  }

  // Focus perdu (tuile démontée pendant qu'une fiche ou le lecteur était ouvert) : on le retrouve
  // au retour, ou au premier appui sur une flèche / OK, au lieu de repartir du haut de la page
  const refocusRef = useRef(refocus)
  useEffect(() => {
    refocusRef.current = refocus
  })
  useEffect(() => {
    const usable = () => {
      const root = rootRef.current
      const active = document.activeElement
      return !!root && !root.closest('[inert]') && !document.querySelector('[data-nav-trap]') && (!active || active === document.body)
    }
    const onLost = (e: Event) => {
      if (!usable()) return
      e.preventDefault()
      refocusRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.key.startsWith('Arrow') || e.key === 'Enter') || !usable()) return
      e.preventDefault()
      refocusRef.current()
    }
    window.addEventListener('moovo:focus-lost', onLost)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('moovo:focus-lost', onLost)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return
    const key = e.key
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
    const target = e.target as HTMLElement
    const inBillboard = !!target.closest('[data-billboard]')
    const inRows = !!target.closest('[data-tile]')
    if (!inBillboard && !inRows) return

    if (e.repeat && repeatTooSoon()) {
      e.preventDefault()
      return
    }
    // Touche maintenue : défilement sans animation, sinon l'image prend du retard sur la télécommande
    if (e.repeat !== fast) setFast(e.repeat)

    if (inBillboard) {
      // Gauche / Droite : navigation spatiale (boutons, menu) ; Bas : première rangée ;
      // Haut : rien au-dessus (sinon la navigation spatiale partait en diagonale dans le menu)
      if (key === 'ArrowDown' && rows.length > 0) {
        e.preventDefault()
        moveTo(0, colOf(0))
      } else if (key === 'ArrowUp') {
        e.preventDefault()
      }
      return
    }

    const len = rows[row]?.items.length ?? 0
    if (key === 'ArrowRight') {
      e.preventDefault()
      if (col < len - 1) moveTo(row, col + 1)
    } else if (key === 'ArrowLeft') {
      // Première tuile : on laisse la navigation spatiale ouvrir le menu
      if (col > 0) {
        e.preventDefault()
        moveTo(row, col - 1)
      }
    } else if (key === 'ArrowDown') {
      e.preventDefault()
      if (row < rows.length - 1) moveTo(row + 1, colOf(row + 1))
    } else if (key === 'ArrowUp') {
      e.preventDefault()
      if (row > 0) moveTo(row - 1, colOf(row - 1))
      else if (billboard) moveTo(-1, 0)
    }
  }

  const onKeyUp = () => {
    if (fast) setFast(false)
  }

  // Le billboard occupe le haut ; les rangées commencent sous le spotlight
  const translate = row >= 0 ? offsets[row] : 0

  return (
    <div
      ref={rootRef}
      data-no-reveal
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocusCapture={onFocusCapture}
      className="tvb relative h-dvh overflow-hidden bg-ink-950"
    >
      <Spotlight item={current} billboard={row < 0} label={row < 0 ? billboardLabel : undefined} actions={row < 0 ? billboardActions : undefined} />

      <div className={`tvb-rows absolute inset-x-0 bottom-0 overflow-hidden ${row < 0 ? 'tvb-rows-low' : ''}`}>
        <div className={`tvb-track ${fast ? 'tvb-fast' : ''}`} style={{ transform: `translate3d(0,-${translate}rem,0)` }}>
          {rows.map((r, i) => (
            <Row
              key={r.key}
              row={r}
              index={i}
              col={colOf(i)}
              active={i === row}
              // Rangée active, celle du dessus (qui sort) et les deux suivantes
              rendered={i >= Math.max(0, row) - 1 && i <= Math.max(0, row) + 2}
              fast={fast && i === row}
              avail={avail}
              onOpen={onOpen}
            />
          ))}
          {empty}
        </div>
      </div>
    </div>
  )
}
