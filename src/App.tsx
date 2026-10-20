import React, { Suspense, lazy, useEffect } from 'react'
import { useIptvStore } from './store/useIptvStore'
import { useDeviceMode } from './hooks/useDevice'
import { useSpatialNavigation } from './hooks/useSpatialNavigation'
import { SignalLoader } from './ui/Brand'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { nativePlatform } from './native'

const Shell = lazy(() => import('./app/Shell').then((m) => ({ default: m.Shell })))
// Téléphone : interface tactile dédiée (« Le Mur de collections ») ; TV et ordinateur gardent la leur
const MobileShell = lazy(() => import('./mobile/MobileShell'))
const Onboarding = lazy(() => import('./views/Onboarding').then((m) => ({ default: m.Onboarding })))

const SOURCE_NAMES = {
  m3u: 'la playlist',
  xtream: 'le serveur Xtream',
  stalker: 'le portail MAG',
  enigma2: 'le décodeur',
} as const

export const App: React.FC = () => {
  const status = useIptvStore((s) => s.status)
  const hasChannels = useIptvStore((s) => s.channels.length > 0)
  const parsingProgress = useIptvStore((s) => s.parsingProgress)
  const connectionMode = useIptvStore((s) => s.connectionMode)
  const initialize = useIptvStore((s) => s.initialize)
  const deviceModePreference = useIptvStore((s) => s.deviceModePreference)
  const device = useDeviceMode(deviceModePreference)

  // L'écran de connexion se pilote aussi à la télécommande
  useSpatialNavigation(!hasChannels)

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (status === 'loading' && !hasChannels) {
    return (
      <SignalLoader
        title="Recherche du signal…"
        detail={`Connexion à ${SOURCE_NAMES[connectionMode]} et lecture des chaînes.`}
        progress={parsingProgress}
      />
    )
  }

  return (
    <Suspense fallback={<SignalLoader title="Moovo TV" />}>
      {hasChannels ? device === 'mobile' ? <MobileShell /> : <Shell device={device} /> : <Onboarding />}
      {nativePlatform === 'android' && <UpdatePrompt />}
    </Suspense>
  )
}

export default App
