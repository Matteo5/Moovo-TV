import React, { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from './Button'
import { checkForUpdate, installUpdate, type AvailableUpdate } from '../services/updateService'

/**
 * Android : propose la nouvelle version de l'application quand android/update.json en annonce une.
 * Pilotable à la télécommande (focus sur « Installer »).
 */
export const UpdatePrompt: React.FC = () => {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const installRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    // Vérification après le démarrage, pour ne pas ralentir l'arrivée sur l'accueil
    const timer = window.setTimeout(() => void checkForUpdate().then(setUpdate), 4000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (update) window.setTimeout(() => installRef.current?.focus(), 50)
  }, [update])

  if (!update) return null

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
          <Button variant="ghost" disabled={progress !== null} onClick={() => setUpdate(null)}>
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  )
}
