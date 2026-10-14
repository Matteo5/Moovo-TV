import { useMemo } from 'react'
import type { VodItem } from '../types/iptv'
import { useIptvStore } from '../store/useIptvStore'
import { isAdultCategory } from '../services/categoryService'

/** Retire des listes les films et séries verrouillés par le contrôle parental (affiches comprises). */
export function useVisibleVod(items: VodItem[]): { visible: VodItem[]; hidden: VodItem[] } {
  const active = useIptvStore((s) => !!s.parentalPin && !s.parentalUnlocked && s.lockAdultVod)
  return useMemo(() => {
    if (!active) return { visible: items, hidden: [] }
    const visible: VodItem[] = []
    const hidden: VodItem[] = []
    for (const it of items) (isAdultCategory(it.category) ? hidden : visible).push(it)
    return { visible, hidden }
  }, [items, active])
}

/** Chaînes dont le bouquet est verrouillé (logo masqué dans les listes). */
export function useLockedCategorySet(): Set<string> | null {
  const pin = useIptvStore((s) => s.parentalPin)
  const unlocked = useIptvStore((s) => s.parentalUnlocked)
  const locked = useIptvStore((s) => s.lockedCategories)
  return useMemo(() => (pin && !unlocked && locked.length ? new Set(locked) : null), [pin, unlocked, locked])
}
