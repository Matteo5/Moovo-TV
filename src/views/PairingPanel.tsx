import React, { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { renderSVG } from 'uqr'
import { MoovoNative, nativePlatform, type PairingPayload } from '../native'
import { useIptvStore } from '../store/useIptvStore'
import type { PlaylistSource } from '../services/playlistsService'

/** L'appairage n'existe que dans l'application Android (serveur local de la TV). */
export const pairingAvailable = nativePlatform === 'android'

function toSource(data: PairingPayload): PlaylistSource | null {
  const epgUrl = data.epgUrl?.trim() || undefined
  if (data.mode === 'xtream' && data.serverUrl && data.username && data.password) {
    return { mode: 'xtream', xtream: { serverUrl: data.serverUrl.trim(), username: data.username.trim(), password: data.password.trim() }, epgUrl }
  }
  if (data.mode === 'm3u' && data.playlistUrl) return { mode: 'm3u', playlistUrl: data.playlistUrl.trim(), epgUrl }
  if (data.mode === 'stalker' && data.portalUrl && data.macAddress) {
    return { mode: 'stalker', stalker: { portalUrl: data.portalUrl.trim(), macAddress: data.macAddress.trim().toUpperCase() }, epgUrl }
  }
  return null
}

/**
 * Connexion depuis le téléphone : la TV affiche un QR code qui ouvre, sur le téléphone, une page servie par la TV
 * elle-même. Les accès saisis y arrivent directement, sans passer par Internet. Le serveur s'arrête à la fermeture.
 */
export const PairingPanel: React.FC<{ className?: string; autofocus?: boolean }> = ({ className = '', autofocus }) => {
  const loadSource = useIptvStore((s) => s.loadSource)
  const [session, setSession] = useState<{ url: string; code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const listener = MoovoNative.addListener('pairingReceived', (data) => {
      const source = toSource(data)
      if (source) void loadSource(source, data.name?.trim() || undefined)
    })
    MoovoNative.startPairing()
      .then((result) => {
        if (!cancelled) setSession(result)
      })
      .catch((err: { code?: string; message?: string }) => {
        if (cancelled) return
        setError(
          err?.code === 'NO_NETWORK'
            ? 'La TV n’est pas connectée au Wi-Fi ou au réseau local.'
            : err?.message?.includes('not implemented')
              ? 'Mettez Moovo TV à jour pour utiliser l’appairage.'
              : err?.message || 'Appairage indisponible.'
        )
      })
    return () => {
      cancelled = true
      void listener.then((h) => h.remove())
      void MoovoNative.stopPairing().catch(() => undefined)
    }
  }, [loadSource])

  const link = session ? `${session.url}?c=${session.code}` : ''

  return (
    // Focusable : à la télécommande, l'écran s'ouvre sur le QR code (la saisie manuelle est en dessous)
    <div
      tabIndex={0}
      data-autofocus={autofocus || undefined}
      className={`rounded-3xl bg-ink-900 p-6 ring-1 ring-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-8 ${className}`}
    >
      <div className="flex items-center gap-3">
        <Smartphone className="size-6 text-accent" />
        <h3 className="font-wide text-xl font-bold">Se connecter avec le téléphone</h3>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-onair">
          {error}
        </p>
      ) : !session ? (
        <p className="mt-4 text-mist">Préparation…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div
            className="size-48 shrink-0 rounded-2xl bg-white p-3 [&>svg]:size-full"
            role="img"
            aria-label="QR code à scanner avec le téléphone"
            dangerouslySetInnerHTML={{ __html: renderSVG(link, { border: 1 }) }}
          />
          <div className="min-w-0">
            <ol className="space-y-2 text-mist">
              <li>1. Mettez le téléphone sur le même Wi-Fi que la TV.</li>
              <li>2. Scannez le QR code avec l’appareil photo.</li>
              <li>3. Saisissez vos accès sur le téléphone et envoyez.</li>
            </ol>
            <p className="mt-4 text-sm text-fog">Sans QR code, ouvrez dans le navigateur du téléphone :</p>
            <p className="mt-1 break-all font-mono text-lg text-paper">{session.url}</p>
            <p className="mt-3 text-sm text-fog">
              Code : <span className="font-mono text-2xl font-bold tracking-[0.3em] text-paper">{session.code}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
