import React, { useEffect, useRef, useState } from 'react'
import { Delete, Lock } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { useBackHandler } from '../hooks/useBackHandler'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const

/**
 * Demande du code parental avant d'ouvrir une chaîne ou un titre verrouillé.
 * Pavé à l'écran (la télécommande Fire TV n'a pas de chiffres) ; les chiffres du clavier marchent aussi.
 */
export const PinPrompt: React.FC = () => {
  const pending = useIptvStore((s) => s.pendingUnlock)
  const submit = useIptvStore((s) => s.submitParentalPin)
  const cancel = useIptvStore((s) => s.cancelUnlock)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useBackHandler(!!pending, cancel)

  const press = (key: (typeof KEYS)[number]) => {
    setError(false)
    if (key === 'del') return setPin((p) => p.slice(0, -1))
    if (key === 'ok') return check(pin)
    const next = (pin + key).slice(0, 4)
    setPin(next)
    if (next.length === 4) check(next)
  }

  const check = (value: string) => {
    if (value.length < 4) return
    if (!submit(value)) {
      setError(true)
      setPin('')
    }
  }

  useEffect(() => {
    if (!pending) return
    setPin('')
    setError(false)
    const id = window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 40)
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault()
        press(e.key as (typeof KEYS)[number])
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        press('del')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('keydown', onKey, true)
    }
    // press dépend de pin : on réabonne à chaque saisie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pin])

  if (!pending) return null
  const title = pending.kind === 'channel' ? pending.channel.name : pending.item.cleanTitle

  return (
    <div ref={rootRef} data-nav-trap role="dialog" aria-modal="true" aria-label="Code parental" className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/90 px-6 animate-rise">
      <div className="w-full max-w-sm rounded-3xl bg-ink-900 p-7 text-center ring-1 ring-white/8 shadow-[0_2rem_5rem_-1rem_rgb(0_0_0/0.9)]">
        <Lock className="mx-auto size-8 text-brand-magenta" />
        <h2 className="mt-4 font-wide text-2xl font-bold">Code parental</h2>
        <p className="mt-1 truncate text-sm text-mist">{title}</p>
        <div className="mt-6 flex justify-center gap-3" aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`size-4 rounded-full transition-colors ${i < pin.length ? 'streak' : 'bg-ink-700'} ${error ? 'bg-onair' : ''}`} />
          ))}
        </div>
        <p className={`mt-3 h-5 text-sm ${error ? 'text-onair' : 'text-fog'}`}>{error ? 'Code incorrect, réessayez.' : 'Entrez les 4 chiffres'}</p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              data-autofocus={key === '1' || undefined}
              aria-label={key === 'del' ? 'Effacer' : key === 'ok' ? 'Valider' : key}
              onClick={() => press(key)}
              className={`flex h-14 items-center justify-center rounded-2xl font-display text-xl font-bold transition-colors ${
                key === 'ok' ? 'btn-brand' : 'bg-ink-800 text-paper hover:bg-ink-700'
              }`}
            >
              {key === 'del' ? <Delete className="size-5" /> : key === 'ok' ? 'OK' : key}
            </button>
          ))}
        </div>
        <button type="button" onClick={cancel} className="mt-5 rounded-lg px-3 py-2 text-sm font-semibold text-mist hover:text-paper">
          Annuler
        </button>
      </div>
    </div>
  )
}
