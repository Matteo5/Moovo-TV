import { useEffect, useRef, useState } from 'react'

/**
 * Saisie d'un numéro de chaîne avec les touches 0-9 (télécommande ou clavier),
 * validée automatiquement après une courte pause ou avec OK / Entrée.
 */
export function useDigitEntry(enabled: boolean, onCommit: (num: number) => void, delayMs = 1400): string {
  const [buffer, setBuffer] = useState('')
  const bufferRef = useRef('')
  const timer = useRef<number | undefined>(undefined)
  const commitRef = useRef(onCommit)

  useEffect(() => {
    commitRef.current = onCommit
  })

  useEffect(() => {
    if (!enabled) return

    const commit = () => {
      window.clearTimeout(timer.current)
      const value = parseInt(bufferRef.current, 10)
      bufferRef.current = ''
      setBuffer('')
      if (value > 0) commitRef.current(value)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return

      if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        bufferRef.current = (bufferRef.current + e.key).slice(-4)
        setBuffer(bufferRef.current)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(commit, delayMs)
      } else if (e.key === 'Enter' && bufferRef.current) {
        e.preventDefault()
        e.stopImmediatePropagation()
        commit()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(timer.current)
    }
  }, [enabled, delayMs])

  return buffer
}
