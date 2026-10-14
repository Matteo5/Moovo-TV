import { Home, Radio, CalendarClock, Clapperboard, Tv, Heart, Search, Settings2, type LucideIcon } from 'lucide-react'
import type { CurrentView } from '../types/iptv'

export interface NavItem {
  view: CurrentView
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { view: 'search', label: 'Rechercher', icon: Search },
  { view: 'home', label: 'Accueil', icon: Home },
  { view: 'live', label: 'Direct', icon: Radio },
  { view: 'epg', label: 'Guide TV', icon: CalendarClock },
  { view: 'movies', label: 'Films', icon: Clapperboard },
  { view: 'series', label: 'Séries', icon: Tv },
  { view: 'favorites', label: 'Favoris', icon: Heart },
]

export const SETTINGS_ITEM: NavItem = { view: 'settings', label: 'Réglages', icon: Settings2 }

// Barre d'onglets mobile : les cinq destinations du quotidien
export const MOBILE_TABS: CurrentView[] = ['home', 'live', 'epg', 'movies', 'series']
