import React, { useEffect, useRef, useState } from 'react'
import type { VodItem } from '../types/iptv'
import { PosterCard } from './PosterCard'

const PAGE = 60

interface PosterGridProps {
  items: VodItem[]
  progressOf?: (item: VodItem) => number | undefined
  onOpen: (item: VodItem) => void
  resetKey?: string
}

/** Grille d'affiches rendue par pages au fil du défilement (catalogues de milliers de titres). */
export const PosterGrid: React.FC<PosterGridProps> = ({ items, progressOf, onOpen, resetKey }) => {
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLimit(PAGE)
  }, [resetKey])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((l) => Math.min(items.length, l + PAGE))
      },
      { rootMargin: '1200px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
    // La sentinelle est recréée quand la liste change ou redevient incomplète : on la réobserve
  }, [items.length, resetKey, limit < items.length])

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
        {items.slice(0, limit).map((item) => (
          <PosterCard key={item.id} item={item} progress={progressOf?.(item)} onOpen={onOpen} className="w-full" />
        ))}
      </div>
      {limit < items.length && <div ref={sentinel} className="h-24" aria-hidden="true" />}
    </>
  )
}
