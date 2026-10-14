import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, History, Play, Download, Crosshair } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { UNIVERSES, categoryLabel, categoryUniverse, filterBySelection, selectionUniverse, universeSelection } from '../services/categoryService'
import type { Channel, EpgProgram } from '../types/iptv'
import { epgService } from '../services/epgService'
import { xtreamService } from '../services/xtreamService'
import { ChannelLogo } from '../ui/ChannelLogo'
import { Button, Chip } from '../ui/Button'
import { ChannelNumber, formatTime } from '../ui/Program'
import { BrandMark } from '../ui/Brand'
import { useNow } from '../hooks/useNow'

const REM_PER_MIN = 0.3 // 1 heure = 18rem
const ROW_REM = 4.25
const HEADER_REM = 2.75
const OVERSCAN_ROWS = 6

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function startOfDay(offset: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'Aujourd’hui'
  if (offset === -1) return 'Hier'
  if (offset === 1) return 'Demain'
  return startOfDay(offset).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
}

function canReplay(channel: Channel, program: EpgProgram, now: number, hasXtream: boolean): boolean {
  if (!hasXtream || !channel.catchupDays || channel.streamId === undefined) return false
  const ended = program.stop.getTime() < now
  const withinWindow = now - program.start.getTime() < channel.catchupDays * 24 * 3600_000
  return ended && withinWindow
}

const GuideEmpty: React.FC = () => {
  const xtreamCreds = useIptvStore((s) => s.xtreamCreds)
  const loadProviderEpg = useIptvStore((s) => s.loadProviderEpg)
  const loadEpg = useIptvStore((s) => s.loadEpg)
  const epgStatus = useIptvStore((s) => s.epgStatus)
  const epgUrl = useIptvStore((s) => s.epgUrl)
  const [url, setUrl] = useState(epgUrl || '')

  if (epgStatus === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <BrandMark pulse className="h-16" />
        <p className="font-wide text-xl font-bold">Chargement du guide…</p>
        <p className="max-w-sm text-mist">Les guides complets pèsent souvent plusieurs dizaines de Mo : comptez quelques secondes.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center px-[var(--gutter)]">
      <div className="max-w-xl">
        <CalendarClock className="size-10 text-accent" />
        <h2 className="mt-5 font-xwide text-3xl font-extrabold tracking-tight">Le guide est vide</h2>
        <p className="mt-3 text-mist">
          Ajoutez un guide des programmes au format XMLTV pour voir ce qui passe sur chaque chaîne et relancer les émissions en replay.
        </p>
        {epgStatus === 'error' && (
          <p className="mt-4 rounded-xl bg-onair/10 px-4 py-3 text-sm text-onair ring-1 ring-onair/30">
            Le dernier guide n’a pas pu être lu. Vérifiez l’adresse ou réessayez plus tard.
          </p>
        )}
        {xtreamCreds && (
          <Button className="mt-7" variant="primary" icon={<Download className="size-4" />} onClick={() => loadProviderEpg()}>
            Charger le guide de mon fournisseur
          </Button>
        )}
        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) loadEpg(url.trim())
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={xtreamCreds ? xtreamService.buildXmltvUrl(xtreamCreds).replace(/password=[^&]+/, 'password=…') : 'https://exemple.com/guide.xml'}
            className="h-11 flex-1 rounded-xl bg-ink-850 px-4 text-paper placeholder:text-fog ring-1 ring-white/6 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <Button type="submit">Charger cette adresse</Button>
        </form>
      </div>
    </div>
  )
}

const GuideView: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const categories = useIptvStore((s) => s.categories)
  const selectedCategory = useIptvStore((s) => s.selectedCategory)
  const selectCategory = useIptvStore((s) => s.selectCategory)
  const favorites = useIptvStore((s) => s.favorites)
  const xtreamCreds = useIptvStore((s) => s.xtreamCreds)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  useIptvStore((s) => s.epgVersion) // re-rendu quand un nouveau guide est chargé
  const now = useNow()

  const [dayOffset, setDayOffset] = useState(0)
  const [focused, setFocused] = useState<{ channel: Channel; program: EpgProgram } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scroll, setScroll] = useState({ top: 0, left: 0, width: 1200, height: 800 })
  const [rem, setRem] = useState(16)

  const hasEpg = epgService.hasData()
  const dayStart = useMemo(() => startOfDay(dayOffset), [dayOffset])
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + 24 * 3600_000), [dayStart])

  // Bouquet masqué entre-temps (ou autre playlist) : on revient à toutes les chaînes plutôt qu'à une grille vide
  const selection =
    selectedCategory === 'ALL' || selectedCategory === 'FAVORITES' || selectionUniverse(selectedCategory) || categories.includes(selectedCategory)
      ? selectedCategory
      : 'ALL'
  const list = useMemo(() => filterBySelection(channels, selection, favorites), [channels, selection, favorites])
  const universes = useMemo(() => UNIVERSES.filter((u) => categories.some((c) => categoryUniverse(c) === u.id)), [categories])

  const ppm = REM_PER_MIN * rem
  const rowPx = ROW_REM * rem
  const headerPx = HEADER_REM * rem
  const leftPx = (window.innerWidth < 768 ? 8.5 : 15) * rem
  const totalWidth = leftPx + 24 * 60 * ppm

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setRem(remPx())
      setScroll((s) => ({ ...s, width: el.clientWidth, height: el.clientHeight }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasEpg])

  const scrollToNow = () => {
    const el = scrollRef.current
    if (!el) return
    const minutes = dayOffset === 0 ? (Date.now() - dayStart.getTime()) / 60000 : 18 * 60
    el.scrollTo({ left: Math.max(0, minutes * ppm - 2 * 60 * ppm * 0.25), behavior: 'auto' })
  }

  useEffect(() => {
    scrollToNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOffset, ppm, hasEpg])

  if (!hasEpg) {
    return (
      <div className="flex h-full flex-col">
        <GuideHeader dayOffset={dayOffset} setDayOffset={setDayOffset} />
        <div className="min-h-0 flex-1">
          <GuideEmpty />
        </div>
      </div>
    )
  }

  const firstRow = Math.max(0, Math.floor((scroll.top - headerPx) / rowPx) - OVERSCAN_ROWS)
  const lastRow = Math.min(list.length, Math.ceil((scroll.top + scroll.height) / rowPx) + OVERSCAN_ROWS)
  const visibleFrom = new Date(dayStart.getTime() + Math.max(0, (scroll.left - leftPx) / ppm - 120) * 60000)
  const visibleTo = new Date(dayStart.getTime() + ((scroll.left + scroll.width) / ppm + 120) * 60000)
  const nowLeft = dayOffset === 0 ? leftPx + ((now - dayStart.getTime()) / 60000) * ppm : null

  const activate = (channel: Channel, program: EpgProgram) => {
    const t = Date.now()
    if (program.start.getTime() <= t && program.stop.getTime() > t) {
      setActiveChannel(channel)
      return
    }
    if (xtreamCreds && canReplay(channel, program, t, true)) {
      const duration = Math.max(15, Math.round((program.stop.getTime() - program.start.getTime()) / 60000))
      const url = xtreamService.buildCatchupUrl(
        xtreamCreds.serverUrl,
        xtreamCreds.username,
        xtreamCreds.password,
        channel.streamId!,
        program.start,
        duration
      )
      setActiveChannel({
        ...channel,
        id: `${channel.id}_replay_${program.start.getTime()}`,
        name: `[Replay] ${channel.name}`,
        subtitle: program.title,
        streamUrl: url,
        url,
        tsUrl: url,
        m3u8Url: url.replace(/\.ts$/, '.m3u8'),
        currentProgram: program,
      })
      return
    }
    setFocused({ channel, program })
  }

  const rows: React.ReactNode[] = []
  for (let i = firstRow; i < lastRow; i++) {
    const channel = list[i]
    const programs = epgService.getProgramsInRange(channel, visibleFrom < dayStart ? dayStart : visibleFrom, visibleTo > dayEnd ? dayEnd : visibleTo)
    rows.push(
      <div key={channel.id} className="absolute flex" style={{ top: headerPx + i * rowPx, height: rowPx, width: totalWidth }}>
        <button
          type="button"
          onClick={() => setActiveChannel(channel)}
          className="sticky left-0 z-[16] flex h-full shrink-0 items-center gap-3 border-b border-r border-white/5 bg-ink-950 px-3 text-left hover:bg-ink-900"
          style={{ width: leftPx }}
        >
          <ChannelNumber value={channel.number} className="hidden w-10 text-sm text-fog md:inline" />
          <ChannelLogo logo={channel.logo} name={channel.name} className="size-10 shrink-0" />
          <span className="hidden min-w-0 truncate text-sm font-semibold md:block">{channel.name}</span>
        </button>
        <div className="relative h-full flex-1 border-b border-white/5">
          {programs.length === 0 && (
            <div className="absolute inset-y-1.5 flex items-center px-4 text-sm text-fog" style={{ left: Math.max(0, scroll.left) + 8 }}>
              Pas de programme
            </div>
          )}
          {programs.map((p) => {
            const startMin = Math.max(0, (p.start.getTime() - dayStart.getTime()) / 60000)
            const endMin = Math.min(24 * 60, (p.stop.getTime() - dayStart.getTime()) / 60000)
            const isNow = p.start.getTime() <= now && p.stop.getTime() > now
            const isPast = p.stop.getTime() <= now
            const replay = canReplay(channel, p, now, !!xtreamCreds)
            return (
              <button
                key={`${p.start.getTime()}-${p.title}`}
                type="button"
                onFocus={() => setFocused({ channel, program: p })}
                onMouseEnter={() => setFocused({ channel, program: p })}
                onClick={() => activate(channel, p)}
                className={`absolute inset-y-1.5 overflow-hidden rounded-lg px-3 text-left transition-colors ${
                  isNow
                    ? 'bg-ink-700 text-paper hover:bg-ink-600'
                    : isPast
                      ? 'bg-ink-900 text-fog hover:bg-ink-800'
                      : 'bg-ink-850 text-mist hover:bg-ink-800'
                }`}
                data-reveal="start"
                style={{
                  left: startMin * ppm + 2,
                  width: Math.max(4, (endMin - startMin) * ppm - 4),
                  // Défilement au focus : le début de l'émission reste visible à droite de la colonne des chaînes
                  scrollMarginLeft: leftPx + 12,
                  scrollMarginTop: headerPx + 8,
                }}
              >
                {isNow && <span className="streak absolute inset-y-0 left-0 w-1" />}
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {replay && <History className="size-3.5 shrink-0 text-brand-cyan" />}
                  <span className="truncate">{p.title}</span>
                </span>
                <span className="block truncate font-mono text-[0.7rem] text-fog tabular">
                  {formatTime(p.start)} – {formatTime(p.stop)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const hours = Array.from({ length: 48 }, (_, i) => i * 30)

  return (
    <div className="flex h-full flex-col">
      <GuideHeader dayOffset={dayOffset} setDayOffset={setDayOffset} onNow={scrollToNow}>
        <select
          value={selection}
          onChange={(e) => selectCategory(e.target.value)}
          aria-label="Catégorie"
          className="h-10 max-w-56 rounded-full bg-ink-800 px-4 text-sm font-semibold text-paper ring-1 ring-white/6 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="ALL">Toutes les chaînes</option>
          <option value="FAVORITES">Favoris</option>
          {universes.map((u) => (
            <optgroup key={u.id} label={u.label}>
              <option value={universeSelection(u.id)}>Tout {u.id === 'other' ? '' : u.label}</option>
              {categories
                .filter((c) => categoryUniverse(c) === u.id)
                .map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </GuideHeader>

      {/* Bandeau d'information sur le programme survolé */}
      <div className="mx-[var(--gutter)] mb-3 hidden h-[5.5rem] items-center gap-5 rounded-2xl bg-ink-900 px-5 ring-1 ring-white/5 md:flex tv:h-[4.25rem]">
        {focused ? (
          <>
            <ChannelLogo logo={focused.channel.logo} name={focused.channel.name} className="size-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {focused.program.title}
                <span className="ml-3 font-mono text-sm text-fog tabular">
                  {formatTime(focused.program.start)} – {formatTime(focused.program.stop)} · {focused.channel.name}
                </span>
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-mist">{focused.program.description || focused.program.category || ''}</p>
            </div>
            <span className="hidden shrink-0 items-center gap-2 text-sm text-fog lg:flex">
              {focused.program.start.getTime() <= now && focused.program.stop.getTime() > now ? (
                <>
                  <Play className="size-4" /> OK pour regarder
                </>
              ) : canReplay(focused.channel, focused.program, now, !!xtreamCreds) ? (
                <>
                  <History className="size-4 text-brand-cyan" /> OK pour le replay
                </>
              ) : null}
            </span>
          </>
        ) : (
          <p className="text-sm text-fog">Parcourez la grille pour voir le détail d’une émission.</p>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          setScroll({ top: el.scrollTop, left: el.scrollLeft, width: el.clientWidth, height: el.clientHeight })
        }}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        <div className="relative" style={{ width: totalWidth, height: headerPx + list.length * rowPx }}>
          {/* Réglette horaire */}
          <div className="sticky top-0 z-20 flex border-b border-white/8 bg-ink-950" style={{ height: headerPx, width: totalWidth }}>
            <div className="sticky left-0 z-10 flex items-center bg-ink-950 px-4 font-display text-sm font-bold text-mist" style={{ width: leftPx }}>
              {dayLabel(dayOffset)}
            </div>
            <div className="relative flex-1">
              {hours.map((m) => (
                <span
                  key={m}
                  className={`absolute top-0 flex h-full items-center border-l pl-2 font-mono text-xs tabular ${m % 60 === 0 ? 'border-white/12 text-mist' : 'border-white/5 text-fog'}`}
                  style={{ left: m * ppm }}
                >
                  {String(Math.floor(m / 60)).padStart(2, '0')}:{String(m % 60).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>

          {rows}

          {nowLeft !== null && (
            <div className="pointer-events-none absolute z-[15] w-0.5 bg-onair shadow-[0_0_12px_var(--color-onair)]" style={{ left: nowLeft, top: 0, height: headerPx + list.length * rowPx }}>
              <span className="absolute -left-[0.3rem] top-1 size-3 rounded-full bg-onair" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const GuideHeader: React.FC<{
  dayOffset: number
  setDayOffset: (d: number) => void
  onNow?: () => void
  children?: React.ReactNode
}> = ({ dayOffset, setDayOffset, onNow, children }) => (
  <div className="flex flex-wrap items-end gap-4 px-[var(--gutter)] pb-4 pt-5 md:pt-8 tv:pb-3 tv:pt-[var(--gutter)]">
    <div className="mr-auto tv:hidden">
      <h1 className="mt-1 font-xwide text-3xl font-extrabold tracking-tight md:text-4xl">{dayLabel(dayOffset)}</h1>
    </div>
    <div className="no-scrollbar flex max-w-full items-center gap-2 overflow-x-auto">
      {[-3, -2, -1, 0, 1, 2].map((d) => (
        <Chip key={d} selected={d === dayOffset} onClick={() => setDayOffset(d)}>
          {dayLabel(d)}
        </Chip>
      ))}
      {onNow && (
        <Button size="sm" icon={<Crosshair className="size-4" />} onClick={onNow}>
          Maintenant
        </Button>
      )}
      {children}
    </div>
  </div>
)

export default GuideView
