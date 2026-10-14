import { useEffect, useState } from 'react'

/** Heure courante, rafraîchie à chaque changement de minute (horloge, progression EPG). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
