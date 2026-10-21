import { useEffect } from 'react'

/**
 * Navigation directionnelle (télécommande Android TV / Fire TV, flèches du clavier, manette).
 *
 * - Les candidats sont limités au calque le plus haut marqué `data-nav-trap` (lecteur, fiche, tiroir).
 * - Le voisin est choisi d'après les bords des éléments : on reste sur la même rangée ou colonne.
 * - Les candidats sont classés : si le meilleur refuse le focus, on essaie le suivant.
 * - L'élément choisi est ramené vers le centre de l'écran, jamais laissé collé au bord.
 * - Un composant peut gérer lui-même une flèche en appelant `preventDefault()` en phase de capture.
 * - `data-nav-skip` exclut un élément ; `data-autofocus` désigne le point d'entrée d'une vue.
 * - `data-nav-entry` marque un menu (Haut / Bas y restent) ; avec `data-nav-exit-up`, Haut en sort par le haut.
 */
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'

type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

function navigationRoot(): ParentNode {
  const traps = document.querySelectorAll<HTMLElement>('[data-nav-trap]')
  return traps.length > 0 ? traps[traps.length - 1] : document
}

// Contenu d'un bloc <details> replié : mesurable par le navigateur mais impossible à focaliser
function insideClosedDetails(el: HTMLElement): boolean {
  const details = el.closest('details')
  if (!details || details.open) return false
  return el.tagName !== 'SUMMARY' || el.parentElement !== details
}

// Dernier élément focalisé hors du menu latéral (pour y revenir avec Droite)
let lastContentFocus: HTMLElement | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement
    if (el instanceof HTMLElement && !el.closest('[data-nav-entry]')) lastContentFocus = el
  })
}

/** Conteneur à défilement horizontal le plus proche (rangée de tuiles), ou null. */
function horizontalScroller(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body) {
    const ox = getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) return node
    node = node.parentElement
  }
  return null
}

function visibleCandidates(root: ParentNode, nearOnly = false): HTMLElement[] {
  const vh = window.innerHeight
  const vw = window.innerWidth
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[data-nav-skip]') || el.closest('[inert]') || insideClosedDetails(el)) return false
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    // Performance sur boîtier TV : on ignore ce qui est très loin de l'écran (le voisin est forcément proche)
    if (nearOnly && (rect.bottom < -2 * vh || rect.top > 3 * vh || rect.right < -3 * vw || rect.left > 4 * vw)) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && style.pointerEvents !== 'none'
  })
}

function overlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

/** Candidats dans la direction donnée, du plus proche au plus lointain. */
function rankNeighbors(current: HTMLElement, candidates: HTMLElement[], dir: Direction): HTMLElement[] {
  const c = current.getBoundingClientRect()
  const scored: { el: HTMLElement; score: number }[] = []

  for (const el of candidates) {
    if (el === current || el.contains(current) || current.contains(el)) continue
    const r = el.getBoundingClientRect()
    let primary: number
    let secondary: number
    let aligned: number

    switch (dir) {
      case 'ArrowRight':
        if (r.left < c.left + 4) continue
        primary = r.left - c.right
        aligned = overlap(c.top, c.bottom, r.top, r.bottom)
        secondary = aligned > 0 ? 0 : Math.abs(r.top + r.height / 2 - (c.top + c.height / 2))
        break
      case 'ArrowLeft':
        if (r.right > c.right - 4) continue
        primary = c.left - r.right
        aligned = overlap(c.top, c.bottom, r.top, r.bottom)
        secondary = aligned > 0 ? 0 : Math.abs(r.top + r.height / 2 - (c.top + c.height / 2))
        break
      case 'ArrowDown':
        // Le centre doit être sous l'élément actif : un bloc un peu moins haut sur la même rangée
        // (émission du guide glissée sous la colonne des chaînes) n'est pas « en dessous »
        if (r.top < c.top + 4 || r.top + r.height / 2 < c.bottom - 4) continue
        primary = r.top - c.bottom
        aligned = overlap(c.left, c.right, r.left, r.right)
        secondary = aligned > 0 ? Math.abs(r.left - c.left) * 0.1 : Math.abs(r.left + r.width / 2 - (c.left + c.width / 2))
        break
      case 'ArrowUp':
        if (r.bottom > c.bottom - 4 || r.top + r.height / 2 > c.top + 4) continue
        primary = c.top - r.bottom
        aligned = overlap(c.left, c.right, r.left, r.right)
        secondary = aligned > 0 ? Math.abs(r.left - c.left) * 0.1 : Math.abs(r.left + r.width / 2 - (c.left + c.width / 2))
        break
    }

    scored.push({ el, score: Math.max(0, primary) + secondary * 2.5 })
  }

  return scored.sort((a, b) => a.score - b.score).map((s) => s.el)
}

/**
 * Amène l'élément dans une zone confortable de l'écran : on recentre seulement
 * s'il sort de la bande centrale, pour éviter de faire bouger la page à chaque appui.
 */
export function revealElement(el: HTMLElement, instant = false) {
  const behavior: ScrollBehavior = instant ? 'auto' : 'smooth'
  // Blocs larges (émissions du guide) : on aligne leur début, en respectant scroll-margin
  if (el.dataset.reveal === 'start') {
    const rect = el.getBoundingClientRect()
    const minLeft = parseFloat(getComputedStyle(el).scrollMarginLeft) || 0
    const scroller = el.closest<HTMLElement>('.overflow-auto')
    const originLeft = scroller ? scroller.getBoundingClientRect().left : 0
    const startHidden = rect.left < originLeft + minLeft - 4 || rect.left > window.innerWidth * 0.8
    if (!scroller) {
      el.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' })
      return
    }
    // Défilement calculé en un seul mouvement : scrollIntoView ignore la colonne et la réglette collantes
    const box = scroller.getBoundingClientRect()
    const minTop = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
    const dx = startHidden ? rect.left - (originLeft + minLeft) : 0
    let dy = 0
    if (rect.top < box.top + minTop) dy = rect.top - (box.top + minTop)
    else if (rect.bottom > box.bottom - 8) dy = rect.bottom - (box.bottom - 8)
    if (dx || dy) scroller.scrollBy({ left: dx, top: dy, behavior })
    return
  }
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const vw = window.innerWidth
  const marginY = vh * 0.18
  const marginX = vw * 0.08
  const block: ScrollLogicalPosition = r.top < marginY || r.bottom > vh - marginY ? 'center' : 'nearest'
  const inline: ScrollLogicalPosition = r.left < marginX || r.right > vw - marginX ? 'center' : 'nearest'
  el.scrollIntoView({ block, inline, behavior })
}

function tryFocus(el: HTMLElement, instant = false): boolean {
  el.focus({ preventScroll: true })
  if (document.activeElement !== el) return false
  revealElement(el, instant)
  return true
}

// Touche maintenue : on limite la cadence et on défile sans animation pour ne pas prendre de retard
let lastMoveAt = 0
const REPEAT_INTERVAL_MS = 70

export function focusFirstIn(root: ParentNode = navigationRoot()): boolean {
  // Sans calque ouvert, on entre dans le contenu de la page (main) plutôt que dans le menu
  const scopes: ParentNode[] = root === document ? [document.querySelector('main') || document, document] : [root]
  for (const scope of scopes) {
    const preferred = scope.querySelector<HTMLElement>('[data-autofocus]')
    if (preferred && !insideClosedDetails(preferred) && tryFocus(preferred)) return true
    for (const el of visibleCandidates(scope)) {
      // Premier élément visible à l'écran de préférence
      const r = el.getBoundingClientRect()
      if (r.bottom > 0 && r.top < window.innerHeight && tryFocus(el)) return true
    }
  }
  for (const el of visibleCandidates(root)) if (tryFocus(el)) return true
  return false
}

// Dans un champ texte, gauche / droite déplacent d'abord le curseur ; au bout du texte, on change d'élément
function caretCanMove(input: HTMLInputElement | HTMLTextAreaElement, dir: Direction): boolean {
  try {
    const start = input.selectionStart
    const end = input.selectionEnd
    if (start === null || end === null) return false
    if (dir === 'ArrowLeft') return start > 0 || end > 0
    if (dir === 'ArrowRight') return end < input.value.length
  } catch {
    // Types de champ sans sélection (email, number…) : pas de curseur à déplacer
  }
  return false
}

export function useSpatialNavigation(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const nowMs = performance.now()
        if (nowMs - lastMoveAt < REPEAT_INTERVAL_MS) {
          e.preventDefault()
          return
        }
        lastMoveAt = nowMs
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const dir = e.key as Direction

      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && (active as HTMLInputElement).type !== 'range'))) {
        if ((dir === 'ArrowLeft' || dir === 'ArrowRight') && caretCanMove(active as HTMLInputElement, dir)) return
      }
      if (active?.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range' && (dir === 'ArrowLeft' || dir === 'ArrowRight')) {
        return
      }

      const root = navigationRoot()
      const candidates = visibleCandidates(root, true)
      // On gère toujours la flèche nous-mêmes : la navigation native de la WebView TV est imprévisible
      e.preventDefault()
      if (candidates.length === 0) return

      if (!active || active === document.body || !candidates.includes(active)) {
        focusFirstIn(root)
        return
      }

      // Les éléments sortis de l'écran sur les côtés (rangées défilées) ne comptent que s'ils sont
      // dans la même rangée que l'élément actif : sinon Gauche depuis le menu repartirait dans le contenu
      const vw = window.innerWidth
      const activeScroller = horizontalScroller(active)
      const reachable = candidates.filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.right > 0 && r.left < vw) return true
        return activeScroller !== null && horizontalScroller(el) === activeScroller
      })

      // Haut / Bas dans un menu (rail, catégories) : on reste dans ce menu
      const menu = active.closest<HTMLElement>('[data-nav-entry]')
      const vertical = dir === 'ArrowUp' || dir === 'ArrowDown'
      const pool = menu && vertical ? reachable.filter((el) => menu.contains(el)) : reachable

      let ranked = rankNeighbors(active, pool, dir)

      // Menu placé sous des onglets (`data-nav-exit-up`) : Haut sur sa première entrée remonte aux onglets
      if (menu && dir === 'ArrowUp' && ranked.length === 0 && menu.hasAttribute('data-nav-exit-up')) {
        const top = menu.getBoundingClientRect().top
        ranked = rankNeighbors(active, reachable.filter((el) => !menu.contains(el) && el.getBoundingClientRect().bottom <= top + 4), dir)
      }

      // En sortant du menu vers la droite, on retrouve l'élément quitté
      const inMenu = active.closest('[data-nav-entry]')
      if (inMenu && dir === 'ArrowRight') {
        const main = document.querySelector('main')
        const preferred =
          lastContentFocus?.isConnected && reachable.includes(lastContentFocus) && !inMenu.contains(lastContentFocus)
            ? lastContentFocus
            : [...(main?.querySelectorAll<HTMLElement>('[data-autofocus]') ?? [])].find((el) => !inMenu.contains(el)) ?? null
        if (preferred && !inMenu.contains(preferred) && reachable.includes(preferred)) {
          ranked = [preferred, ...ranked.filter((el) => el !== preferred)]
        }
      }
      // En entrant dans un menu (data-nav-entry), on arrive sur la page en cours plutôt que sur le voisin géométrique
      const entry = ranked[0]?.closest<HTMLElement>('[data-nav-entry]')
      if (entry && !entry.contains(active)) {
        const current = entry.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]')
        if (current) ranked = [current, ...ranked.filter((el) => el !== current)]
      }
      // Idem pour une rangée d'onglets : on arrive sur l'onglet ouvert (un onglet s'ouvre dès qu'il reçoit le focus,
      // arriver sur son voisin changerait la page sous les yeux de l'utilisateur)
      const tablist = ranked[0]?.closest<HTMLElement>('[role="tablist"]')
      if (tablist && !tablist.contains(active)) {
        const current = tablist.querySelector<HTMLElement>('[aria-selected="true"]')
        if (current && reachable.includes(current)) ranked = [current, ...ranked.filter((el) => el !== current)]
      }

      for (const target of ranked.slice(0, 6)) {
        if (tryFocus(target, e.repeat)) return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
