import { useIptvStore } from '../store/useIptvStore'

/** Genre à ouvrir à l'arrivée sur Films / Séries (« Tout voir » d'une collection, tuile de genre de la recherche). */
let pendingGenre: { type: 'movie' | 'series'; category: string } | null = null

export function goToCatalog(type: 'movie' | 'series', category?: string) {
  pendingGenre = category ? { type, category } : null
  useIptvStore.getState().setCurrentView(type === 'movie' ? 'movies' : 'series')
  window.scrollTo({ top: 0 })
}

export function takePendingGenre(type: 'movie' | 'series'): string | null {
  if (pendingGenre?.type !== type) return null
  const { category } = pendingGenre
  pendingGenre = null
  return category
}
