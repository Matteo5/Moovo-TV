/**
 * Couleurs d'accent Moovo TV, toutes tirées du logo. La couleur active est posée sur
 * <html data-accent="..."> et exposée en CSS via --accent (voir index.css) : les composants
 * utilisent `bg-accent`, `text-accent`, `ring-accent`... sans connaître la teinte.
 * La traînée en dégradé du logo reste la signature, quel que soit l'accent choisi.
 */
export type AccentColor = 'cyan' | 'magenta' | 'orange' | 'yellow'

export interface AccentTheme {
  id: AccentColor
  label: string
  hint: string
  hex: string
}

export const ACCENT_THEMES: Record<AccentColor, AccentTheme> = {
  cyan: { id: 'cyan', label: 'Cyan', hint: 'La queue de la traînée du logo', hex: '#1EC8FF' },
  magenta: { id: 'magenta', label: 'Magenta', hint: 'Le cœur du « M »', hex: '#FF3EA5' },
  orange: { id: 'orange', label: 'Orange', hint: 'La pointe du « M »', hex: '#FF8A1F' },
  yellow: { id: 'yellow', label: 'Jaune', hint: 'Le badge « TV »', hex: '#FFD23F' },
}

export const ACCENT_ORDER: AccentColor[] = ['cyan', 'magenta', 'orange', 'yellow']

// Anciennes valeurs (versions précédentes, sauvegardes JSON) vers les couleurs du logo
const LEGACY_ACCENTS: Record<string, AccentColor> = {
  tally: 'orange',
  signal: 'cyan',
  phosphor: 'cyan',
  red: 'magenta',
  blue: 'cyan',
  emerald: 'cyan',
  purple: 'magenta',
}

export function normalizeAccent(value: string | null | undefined): AccentColor {
  if (value && value in ACCENT_THEMES) return value as AccentColor
  if (value && value in LEGACY_ACCENTS) return LEGACY_ACCENTS[value]
  return 'cyan'
}

export function applyAccent(color: AccentColor) {
  document.documentElement.dataset.accent = color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#030919')
}
