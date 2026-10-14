import { useEffect, useRef } from 'react'

/**
 * Bouton Retour : télécommande Android TV, geste retour Android, bouton précédent du navigateur, Échap.
 *
 * Chaque calque ouvert (lecteur, fiche, tiroir, menu) correspond à une entrée d'historique portant
 * sa profondeur (`moovoDepth`). À chaque retour, on referme les calques au-delà de la profondeur
 * atteinte : l'état reste cohérent même si des calques s'ouvrent et se ferment dans la même frame.
 *
 * Sans calque ouvert, le retour est confié au gestionnaire racine (retour à l'accueil),
 * puis à l'application native (quitter).
 */
interface Entry {
  close: () => void
  /** Appelé avant la fermeture par la touche Retour ; renvoie true s'il a consommé l'appui. */
  intercept: () => boolean
  closedByHistory: boolean
  restoreFocus: HTMLElement | null
}

const stack: Entry[] = []
let trimTimer: number | undefined
let listening = false
let rootHandler: (() => boolean) | null = null
// Dernier élément ayant eu le focus : quand un calque s'ouvre, la page dessous devient inerte
// et perd son focus avant que le calque ne s'enregistre
let lastFocused: HTMLElement | null = null

const depthOf = (state: unknown): number => {
  const d = (state as { moovoDepth?: unknown } | null)?.moovoDepth
  return typeof d === 'number' ? d : 0
}

// Rend le focus à l'élément actif avant l'ouverture du calque (indispensable à la télécommande)
function restoreFocus(entry: Entry) {
  const el = entry.restoreFocus
  if (!el) return
  window.setTimeout(() => {
    const active = document.activeElement
    if (el.isConnected && (!active || active === document.body)) el.focus({ preventScroll: true })
  }, 60)
}

function closeEntry(entry: Entry) {
  entry.closedByHistory = true
  entry.close()
  restoreFocus(entry)
}

function reconcile() {
  const depth = depthOf(history.state)
  while (stack.length > depth) closeEntry(stack.pop()!)
}

export function hasOpenOverlay(): boolean {
  return stack.length > 0
}

/** Ferme le calque du dessus en passant par l'historique (pour les boutons « Retour »). */
export function goBack() {
  if (stack.length === 0) return
  const steps = depthOf(history.state) - (stack.length - 1)
  if (steps > 0) history.go(-steps)
  else closeEntry(stack.pop()!)
}

/** Gestionnaire appelé quand Retour est pressé sans calque ouvert ; renvoie true s'il a agi. */
export function setRootBackHandler(handler: (() => boolean) | null) {
  rootHandler = handler
}

/**
 * Traite un appui sur Retour. Renvoie 'exit' si rien n'a pu être fermé
 * (l'application native peut alors proposer de quitter).
 */
export function handleBack(): 'handled' | 'exit' {
  if (stack.length > 0) {
    // Ex. : le lecteur masque d'abord ses commandes, un second appui le ferme
    if (stack[stack.length - 1].intercept()) return 'handled'
    goBack()
    return 'handled'
  }
  if (rootHandler?.()) return 'handled'
  return 'exit'
}

function ensureListeners() {
  if (listening) return
  listening = true

  window.addEventListener('popstate', reconcile)
  document.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLElement && e.target !== document.body) lastFocused = e.target
  })

  window.addEventListener(
    'keydown',
    (e) => {
      const isBackKey = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 10009
      if (!isBackKey) return
      const target = e.target as HTMLElement | null
      // Échap dans un champ rempli vide d'abord le champ
      if (e.key === 'Escape' && target?.tagName === 'INPUT' && (target as HTMLInputElement).value) return
      if (stack.length === 0 && !rootHandler) return
      if (handleBack() === 'handled') {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true
  )
}

export function installBackListeners() {
  ensureListeners()
}

export function useBackHandler(active: boolean, onBack: () => void, intercept?: () => boolean) {
  const onBackRef = useRef(onBack)
  const interceptRef = useRef(intercept)
  useEffect(() => {
    onBackRef.current = onBack
    interceptRef.current = intercept
  })

  useEffect(() => {
    if (!active) return
    ensureListeners()
    window.clearTimeout(trimTimer)

    const focusedNow = document.activeElement as HTMLElement | null
    const previous = focusedNow && focusedNow !== document.body ? focusedNow : lastFocused
    const entry: Entry = {
      close: () => onBackRef.current(),
      intercept: () => interceptRef.current?.() ?? false,
      closedByHistory: false,
      restoreFocus: previous,
    }
    stack.push(entry)
    const depth = stack.length
    // Une entrée de cette profondeur existe déjà (calque refermé à l'instant) : on la réutilise
    if (depthOf(history.state) >= depth) history.replaceState({ ...(history.state || {}), moovoDepth: depth }, '')
    else history.pushState({ moovoDepth: depth }, '')

    return () => {
      if (entry.closedByHistory) return
      const pos = stack.indexOf(entry)
      if (pos !== -1) stack.splice(pos, 1)
      restoreFocus(entry)
      // Fermé par l'interface : on retire l'entrée d'historique, sauf si un autre calque la reprend aussitôt
      window.clearTimeout(trimTimer)
      trimTimer = window.setTimeout(() => {
        const extra = depthOf(history.state) - stack.length
        if (extra > 0) history.go(-extra)
      }, 80)
    }
  }, [active])
}
