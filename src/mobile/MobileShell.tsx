import React, { Suspense, lazy, useEffect } from 'react'
import { ChevronLeft, Clapperboard, Home, Radio, Search, Tv, type LucideIcon } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { CurrentView } from '../types/iptv'
import { installBackListeners, setRootBackHandler } from '../hooks/useBackHandler'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { PinPrompt } from '../ui/PinPrompt'
import { BrandMark } from '../ui/Brand'
import { MobileHome } from './MobileHome'

const MobileCatalog = lazy(() => import('./MobileCatalog'))
const MobileLive = lazy(() => import('./MobileLive'))
const MobileSearch = lazy(() => import('./MobileSearch'))
const MobileLibrary = lazy(() => import('./MobileLibrary'))
const MobileDetail = lazy(() => import('./MobileDetail'))
const SettingsView = lazy(() => import('../views/SettingsView'))
const GuideView = lazy(() => import('../views/GuideView'))
const PlayerScreen = lazy(() => import('../player/PlayerScreen'))

interface Tab {
  view: CurrentView
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { view: 'home', label: 'Accueil', icon: Home },
  { view: 'movies', label: 'Films', icon: Clapperboard },
  { view: 'series', label: 'Séries', icon: Tv },
  { view: 'live', label: 'Direct', icon: Radio },
  { view: 'search', label: 'Recherche', icon: Search },
]

// Pages secondaires : on les rattache à l'onglet d'où l'on vient pour la barre et le bouton Retour
const PARENT: Partial<Record<CurrentView, CurrentView>> = { favorites: 'home', settings: 'favorites', epg: 'live' }

/**
 * Barre d'onglets flottante : une gélule de verre sombre au-dessus du contenu.
 * La pastille claire glisse sous l'onglet actif.
 */
const TabBar: React.FC<{ view: CurrentView; onSelect: (v: CurrentView) => void }> = ({ view, onSelect }) => {
  const rootView = PARENT[view] && !TABS.some((t) => t.view === view) ? (PARENT[PARENT[view]!] ?? PARENT[view]!) : view
  const index = Math.max(0, TABS.findIndex((t) => t.view === rootView))
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40"
    >
      <div className="m-bar relative grid h-[3.9rem] grid-cols-5 rounded-[1.95rem] p-1 ring-1 ring-white/10 shadow-[0_1.25rem_2.5rem_-0.75rem_rgb(0_0_0/0.85)]">
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] rounded-[1.6rem] bg-white/[0.12] transition-transform duration-[420ms] ease-[var(--ease-snap)]"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {TABS.map((tab, i) => {
          const Icon = tab.icon
          const active = i === index
          return (
            <button
              key={tab.view}
              type="button"
              onClick={() => onSelect(tab.view)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-[1.6rem] text-[0.66rem] font-semibold transition-colors ${
                active ? 'text-paper' : 'text-fog'
              }`}
            >
              <Icon className="size-[1.3rem]" strokeWidth={active ? 2.4 : 1.9} />
              {tab.label}
              {/* Sélection : la traînée du M sous l'onglet actif */}
              {active && <span aria-hidden="true" className="streak absolute bottom-1 h-[3px] w-5 rounded-full" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** Bandeau Retour des pages secondaires qui gardent leur propre titre (réglages, guide). */
const BackBar: React.FC<{ label: string; onBack: () => void }> = ({ label, onBack }) => (
  <div className="flex h-11 shrink-0 items-center px-3">
    <button type="button" onClick={onBack} className="m-press flex items-center gap-0.5 rounded-full py-1.5 pr-3 text-[0.95rem] font-semibold text-mist">
      <ChevronLeft className="size-6" /> {label}
    </button>
  </div>
)

const PageFallback: React.FC = () => (
  <div className="flex h-[70dvh] items-center justify-center">
    <BrandMark pulse className="h-14" />
  </div>
)

function renderPage(view: CurrentView, go: (v: CurrentView) => void) {
  switch (view) {
    case 'movies':
      return <MobileCatalog key="movie" type="movie" />
    case 'series':
      return <MobileCatalog key="series" type="series" />
    case 'live':
      return <MobileLive />
    case 'search':
      return <MobileSearch />
    case 'favorites':
      return <MobileLibrary />
    case 'settings':
      return (
        <div className="pb-[calc(var(--m-tabbar)+2rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <BackBar label="Ma liste" onBack={() => go('favorites')} />
          <div className="px-[var(--m-gutter)]">
            <SettingsView />
          </div>
        </div>
      )
    case 'epg':
      return (
        <div className="flex h-dvh flex-col pb-[var(--m-tabbar)] pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <BackBar label="Direct" onBack={() => go('live')} />
          <div className="min-h-0 flex-1">
            <GuideView />
          </div>
        </div>
      )
    default:
      return <MobileHome />
  }
}

export const MobileShell: React.FC = () => {
  const currentView = useIptvStore((s) => s.currentView)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const activeChannel = useIptvStore((s) => s.activeChannel)
  const vodDetail = useIptvStore((s) => s.vodDetail)
  const pendingUnlock = useIptvStore((s) => s.pendingUnlock)
  const refreshNowPlaying = useIptvStore((s) => s.refreshNowPlaying)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const closeVodDetail = useIptvStore((s) => s.closeVodDetail)

  // Retour Android : page secondaire → sa page parente → accueil → quitter
  useEffect(() => {
    installBackListeners()
    setRootBackHandler(() => {
      const { currentView: view, setCurrentView: go } = useIptvStore.getState()
      if (view === 'home') return false
      go(PARENT[view] ?? 'home')
      window.scrollTo({ top: 0 })
      return true
    })
    return () => setRootBackHandler(null)
  }, [])

  useEffect(() => {
    const id = window.setInterval(refreshNowPlaying, 60_000)
    return () => window.clearInterval(id)
  }, [refreshNowPlaying])

  const go = (view: CurrentView) => {
    // Toucher l'onglet déjà ouvert remonte en haut, comme sur iOS
    if (view === currentView) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setCurrentView(view)
    window.scrollTo({ top: 0 })
  }

  const overlayOpen = !!activeChannel || !!vodDetail || !!pendingUnlock

  return (
    <div className="min-h-dvh bg-ink-950 text-paper">
      <main inert={overlayOpen}>
        <ErrorBoundary key={currentView} area="Cette page">
          <Suspense fallback={<PageFallback />}>{renderPage(currentView, go)}</Suspense>
        </ErrorBoundary>
      </main>

      {!activeChannel && <TabBar view={currentView} onSelect={go} />}

      <Suspense fallback={null}>
        {vodDetail && (
          <ErrorBoundary area="La fiche" fullscreen onReset={closeVodDetail}>
            <MobileDetail key={vodDetail.id} />
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

export default MobileShell
