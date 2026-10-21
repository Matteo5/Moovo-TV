import React, { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from './Button'
import { checkForUpdate, installUpdate, prepareUpdate, type AvailableUpdate } from '../services/updateService'
import { useIptvStore } from '../store/useIptvStore'

/**
 * Android : quand android/update.json annonce une nouvelle version, l'APK est téléchargé en arrière-plan,
 * puis la fenêtre propose l'installation (jamais pendant la lecture d'une chaîne ou d'un film).
 * Pilotable à la télécommande (focus sur « Installer »).
 */
export const UpdatePrompt: React.FC = () => {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const installRef = useRef<HTMLButtonElement | null>(null)
  const playing = useIptvStore((s) => s.activeChannel !== null)

  useEffect(() => {
    let cancelled = false
    // Vérification après le démarrage, pour ne pas ralentir l'arrivée sur l'accueil
    const timer = window.setTimeout(async () => {
      const found = await checkForUpdate()
      if (!found || cancelled) return
      setUpdate(found)
      // Échec du téléchargement silencieux : « Installer » le relancera, avec la progression affichée
      await prepareUpdate(found).catch(() => undefined)
      if (!cancelled) setReady(true)
    }, 4000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const visible = !!update && ready && !playing

  useEffect(() => {
    if (visible) window.setTimeout(() => installRef.current?.focus(), 50)
  }, [visible])

  if (!update || !visible) return null

  const install = async () => {
    setMessage(null)
    setProgress(0)
    try {
      await installUpdate(update, setProgress)
      setMessage('Confirmez l’installation dans la fenêtre d’Android.')
    } catch (err) {
      const code = (err as { code?: string })?.code
      setMessage(
        code === 'NEED_PERMISSION'
          ? 'Activez « Autoriser cette source » pour Moovo TV dans l’écran qui vient de s’ouvrir, revenez avec Retour, puis appuyez de nouveau sur Installer.'
          : (err as Error)?.message || 'Téléchargement impossible. Réessayez dans un instant.'
      )
    } finally {
      setProgress(null)
    }
  }

  const percent = progress !== null && progress >= 0 ? Math.round(progress * 100) : null

  return (
    <div data-nav-trap role="dialog" aria-label="Mise à jour disponible" className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-ink-900 p-8 ring-1 ring-white/10 animate-rise">
        <Download className="size-9 text-accent" />
        <h2 className="mt-4 font-wide text-2xl font-bold">Moovo TV {update.versionName} est disponible</h2>
        <p className="mt-2 text-mist">
          {update.currentVersionName ? `Version installée : ${update.currentVersionName}. ` : ''}
          {update.notes || 'Corrections et améliorations.'}
        </p>
        <p className="mt-2 text-sm text-fog">Votre connexion, vos favoris et vos réglages sont conservés.</p>
        {progress !== null && (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent ?? 30}%` }} />
            </div>
            <p className="mt-2 text-sm text-mist">Téléchargement… {percent !== null ? `${percent} %` : ''}</p>
          </div>
        )}
        {message && <p className="mt-4 text-sm text-paper">{message}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button ref={installRef} variant="primary" data-autofocus icon={<Download className="size-4" />} disabled={progress !== null} onClick={() => void install()}>
            Installer
          </Button>
          <Button
            variant="ghost"
            disabled={progress !== null}
            onClick={() => {
              setUpdate(null)
              setReady(false)
            }}
          >
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  )
}
