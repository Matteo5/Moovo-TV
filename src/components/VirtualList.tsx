import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface VirtualListProps<T> {
  items: T[]
  /** Hauteur fixe d'une ligne, en rem (suit l'échelle TV / desktop / mobile). */
  rowHeightRem: number
  overscan?: number
  getKey: (item: T, index: number) => string
  renderRow: (item: T, index: number) => React.ReactNode
  className?: string
  /** Fait défiler jusqu'à cet index quand il change (ex : chaîne en cours). */
  scrollToIndex?: number
  /** Quand cette clé change (ex : catégorie), la liste revient en haut. */
  resetKey?: string
}

function rootFontSize() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

/**
 * Liste à fenêtre glissante : seules les lignes visibles sont rendues.
 * Indispensable pour les playlists de plusieurs milliers de chaînes, surtout sur TV.
 */
export function VirtualList<T>({
  items,
  rowHeightRem,
  overscan = 8,
  getKey,
  renderRow,
  className = '',
  scrollToIndex,
  resetKey,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(600)
  const [rowPx, setRowPx] = useState(rowHeightRem * 16)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      setViewport(el.clientHeight)
      setRowPx(rowHeightRem * rootFontSize())
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rowHeightRem])

  useEffect(() => {
    const el = containerRef.current
    if (!el || scrollToIndex === undefined || scrollToIndex < 0) return
    const top = scrollToIndex * rowPx
    if (top < el.scrollTop || top + rowPx > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + rowPx / 2)
    }
  }, [scrollToIndex, rowPx])

  // Nouvelle liste (changement de catégorie) : retour en haut
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [resetKey])

  const start = Math.max(0, Math.floor(scrollTop / rowPx) - overscan)
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / rowPx) + overscan)

  const rows: React.ReactNode[] = []
  for (let i = start; i < end; i++) {
    rows.push(
      <div key={getKey(items[i], i)} className="absolute inset-x-0" style={{ top: i * rowPx, height: rowPx }}>
        {renderRow(items[i], i)}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`relative overflow-y-auto overscroll-contain ${className}`}
    >
      <div className="relative" style={{ height: items.length * rowPx }}>
        {rows}
      </div>
    </div>
  )
}
