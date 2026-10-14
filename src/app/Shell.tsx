import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useIptvStore } from '../store/useIptvStore'
import type { CurrentView, DeviceMode } from '../types/iptv'
import { NAV_ITEMS, SETTINGS_ITEM, MOBILE_TABS, type NavItem } from './navigation'
import { BrandMark, BrandWordmark, Wordmark } from '../ui/Brand'
import { useSpatialNavigation, focusFirstIn } from '../hooks/useSpatialNavigation'
import { installBackListeners, setRootBackHandler } from '../hooks/useBackHandler'
import { useDigitEntry } from '../hooks/useDigitEntry'
import { useNow } from '../hooks/useNow'
import { HomeView } from '../views/HomeView'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { PinPrompt } from '../ui/PinPrompt'

const LiveView = lazy(() => import('../views/LiveView'))
const GuideView = lazy(() => import('../views/GuideView'))
const VodView = lazy(() => import('../views/VodView'))
const FavoritesView = lazy(() => import('../views/FavoritesView'))
const SearchView = lazy(() => import('../views/SearchView'))
const SettingsView = lazy(() => import('../views/SettingsView'))
const PlayerScreen = lazy(() => import('../player/PlayerScreen'))
const VodDetail = lazy(() => import('../views/VodDetail'))

// Vues plein écran à défilement interne (listes longues, grille horaire)
const FULL_HEIGHT_VIEWS: CurrentView[] = ['live', 'epg']

function renderView(view: CurrentView) {
  switch (view) {
    case 'live':
      return <LiveView />
    case 'epg':
      return <GuideView />
    case 'movies':
      return <VodView type="movie" />
    case 'series':
      return <VodView type="series" />
    case 'favorites':
      return <FavoritesView />
    case 'search':
      return <SearchView />
    case 'settings':
      return <SettingsView />
    default:
      return <HomeView />
  }
}

const Clock: React.FC<{ className?: string }> = ({ className = '' }) => {
  const now = useNow(15_000)
  const date = new Date(now)
  return (
    <div className={`text-right leading-tight ${className}`} aria-label="Heure">
      <p className="font-mono text-lg font-bold text-paper tabular">
        {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-xs capitalize text-fog">
        {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>
  )
}

const RailButton: React.FC<{ item: NavItem; active: boolean; onSelect: (v: CurrentView) => void }> = ({
  item,
  active,
  onSelect,
}) => {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={(e) => {
        onSelect(item.view)
        // Clic souris : on replie le rail ; à la télécommande (detail = 0) il reste ouvert
        if (e.detail > 0) e.currentTarget.blur()
      }}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-12 w-full items-center gap-4 rounded-xl px-[1.15rem] text-left transition-colors ${
        active ? 'text-paper bg-white/8' : 'text-fog hover:text-paper hover:bg-white/5'
      }`}
    >
      {active && <span className="streak absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full" />}
      <Icon className={`size-[1.35rem] shrink-0 ${active ? 'text-accent' : ''}`} strokeWidth={active ? 2.4 : 2} />
      <span className="truncate font-semibold rail-label opacity-0 transition-opacity duration-200">
        {item.label}
      </span>
    </button>
  )
}

const NavRail: React.FC<{ view: CurrentView; onSelect: (v: CurrentView) => void }> = ({ view, onSelect }) => {
  // Ouvert tant que le focus clavier / télécommande est dans le rail (pas après un clic souris)
  const [open, setOpen] = useState(false)
  return (
  <nav
    aria-label='Navigation principale'
    data-nav-entry
    onFocus={(e) => {
      const target = e.target as HTMLElement
      let keyboard = true
      try {
        keyboard = target.matches(':focus-visible')
      } catch {
        // Navigateur trop ancien pour :focus-visible : on considère un focus clavier
      }
      if (keyboard) setOpen(true)
    }}
    onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
    }}
    className={`rail ${open ? 'rail-open' : ''} fixed inset-y-0 left-0 z-40 flex w-[var(--rail-w)] flex-col gap-1 overflow-hidden border-r border-white/5 bg-ink-950/95 px-2.5 py-6 backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-[var(--ease-snap)]`}
  >
    <div className="mb-6 flex h-12 items-center gap-1 px-[0.45rem]">
      <BrandMark className="h-12 shrink-0" />
      <BrandWordmark className="rail-label h-7 shrink-0 opacity-0 transition-opacity" />
    </div>
    {NAV_ITEMS.map((item) => (
      <RailButton key={item.view} item={item} active={view === item.view} onSelect={onSelect} />
    ))}
    <div className="mt-auto">
      <RailButton item={SETTINGS_ITEM} active={view === 'settings'} onSelect={onSelect} />
    </div>
  </nav>
  )
}

const MobileTopBar: React.FC<{ view: CurrentView; onSelect: (v: CurrentView) => void }> = ({ view, onSelect }) => {
  const extras = NAV_ITEMS.filter((i) => i.view === 'search' || i.view === 'favorites').concat(SETTINGS_ITEM)
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/5 bg-ink-950/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <button type="button" onClick={() => onSelect('home')} aria-label="Accueil">
        <Wordmark />
      </button>
      <div className="flex items-center gap-1">
        {extras.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.view}
              type="button"
              aria-label={item.label}
              onClick={() => onSelect(item.view)}
              className={`flex size-10 items-center justify-center rounded-xl ${view === item.view ? 'text-accent' : 'text-mist'}`}
            >
              <Icon className="size-5" />
            </button>
          )
        })}
      </div>
    </header>
  )
}

const MobileTabBar: React.FC<{ view: CurrentView; onSelect: (v: CurrentView) => void }> = ({ view, onSelect }) => (
  <nav
    aria-label="Navigation principale"
    className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/6 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
  >
    {MOBILE_TABS.map((v) => {
      const item = NAV_ITEMS.find((i) => i.view === v)!
      const Icon = item.icon
      const active = view === v
      return (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          aria-current={active ? 'page' : undefined}
          className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold ${
            active ? 'text-paper' : 'text-fog'
          }`}
        >
          {active && <span className="streak absolute top-0 h-0.5 w-8 rounded-b-full" />}
          <Icon className={`size-[1.35rem] ${active ? 'text-accent' : ''}`} strokeWidth={active ? 2.4 : 2} />
          {item.label}
        </button>
      )
    })}
  </nav>
)

/** Affichage OSD du numéro tapé à la télécommande. */
export const DigitOsd: React.FC<{ digits: string; label?: string }> = ({ digits, label }) =>
  digits ? (
    <div className="pointer-events-none fixed right-[var(--gutter)] top-[calc(var(--gutter)+env(safe-area-inset-top))] z-[70] rounded-2xl bg-ink-950/85 px-6 py-4 text-right ring-1 ring-white/10 backdrop-blur-xl animate-rise">
      <p className="font-mono text-5xl font-bold text-accent tabular">
        {digits.padStart(3, '·')}
        <span className="animate-onair">_</span>
      </p>
      {label && <p className="mt-1 max-w-56 truncate text-sm text-mist">{label}</p>}
    </div>
  ) : null

const ViewFallback: React.FC = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <BrandMark pulse className="h-16" />
  </div>
)

export const Shell: React.FC<{ device: DeviceMode }> = ({ device }) => {
  const currentView = useIptvStore((s) => s.currentView)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const activeChannel = useIptvStore((s) => s.activeChannel)
  const vodDetail = useIptvStore((s) => s.vodDetail)
  const channels = useIptvStore((s) => s.channels)
  const playChannelNumber = useIptvStore((s) => s.playChannelNumber)
  const refreshNowPlaying = useIptvStore((s) => s.refreshNowPlaying)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const closeVodDetail = useIptvStore((s) => s.closeVodDetail)
  const pendingUnlock = useIptvStore((s) => s.pendingUnlock)
  const mainRef = useRef<HTMLElement | null>(null)

  useSpatialNavigation(true)

  // Retour sans calque ouvert : on revient à l'accueil avant de quitter l'application
  useEffect(() => {
    installBackListeners()
    setRootBackHandler(() => {
      const { currentView: view, setCurrentView: go } = useIptvStore.getState()
      if (view === 'home') return false
      go('home')
      window.scrollTo({ top: 0 })
      return true
    })
    return () => setRootBackHandler(null)
  }, [])

  // Programme « en cours » rafraîchi chaque minute
  useEffect(() => {
    const id = window.setInterval(refreshNowPlaying, 60_000)
    return () => window.clearInterval(id)
  }, [refreshNowPlaying])

  const overlayOpen = !!activeChannel || !!vodDetail || !!pendingUnlock
  const digits = useDigitEntry(!overlayOpen, (num) => {
    playChannelNumber(num)
  })
  const typedChannel = digits ? channels.find((c) => c.number === parseInt(digits, 10)) : undefined

  const isMobile = device === 'mobile'
  const fullHeight = FULL_HEIGHT_VIEWS.includes(currentView)

  const selectView = (view: CurrentView) => {
    setCurrentView(view)
    if (!fullHeight) window.scrollTo({ top: 0 })
  }

  // À la télécommande, on entre dans la nouvelle vue au lieu de rester dans le menu
  useEffect(() => {
    if (device !== 'tv') return
    const id = window.setTimeout(() => {
      const active = document.activeElement
      if (!active || active === document.body) focusFirstIn(mainRef.current || document)
    }, 250)
    return () => window.clearTimeout(id)
  }, [currentView, device])

  return (
    <div className="min-h-dvh bg-ink-950 text-paper">
      {isMobile ? (
        <>
          <MobileTopBar view={currentView} onSelect={selectView} />
          <MobileTabBar view={currentView} onSelect={selectView} />
        </>
      ) : (
        <>
          <NavRail view={currentView} onSelect={selectView} />
          {currentView === 'home' && <Clock className="pointer-events-none fixed right-[var(--gutter)] top-6 z-30 drop-shadow-lg" />}
        </>
      )}

      <main
        ref={mainRef}
        inert={overlayOpen}
        className={`${isMobile ? 'pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]' : 'pl-[var(--rail-w)]'} ${
          fullHeight ? (isMobile ? 'h-dvh overflow-hidden' : 'h-dvh overflow-hidden') : ''
        }`}
      >
        <ErrorBoundary key={currentView} area="Cette page">
          <Suspense fallback={<ViewFallback />}>{renderView(currentView)}</Suspense>
        </ErrorBoundary>
      </main>

      <DigitOsd digits={digits} label={typedChannel?.name || (digits ? 'Aucune chaîne' : undefined)} />

      <Suspense fallback={null}>
        {vodDetail && (
          <ErrorBoundary area="La fiche" fullscreen onReset={closeVodDetail}>
            <VodDetail />
          </ErrorBoundary>
        )}
        {activeChannel && (
          <ErrorBoundary area="Le lecteur" fullscreen onReset={() => setActiveChannel(null)}>
            <PlayerScreen key="player" />
          </ErrorBoundary>
        )}
      </Suspense>

      <PinPrompt />
    </div>
  )
}
