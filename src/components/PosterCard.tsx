import React, { useState } from 'react'
import { Star } from 'lucide-react'
import type { VodItem } from '../types/iptv'
import { ProgressLine } from '../ui/Program'
import { categoryLabel } from '../services/categoryService'

interface PosterCardProps {
  item: VodItem
  progress?: number
  /** Rang dans les tendances de la semaine (badge « N°x ») */
  rank?: number
  /** Affiche de meilleure qualité (TMDB) à préférer à celle du fournisseur */
  poster?: string
  onOpen: (item: VodItem) => void
  className?: string
}

/** Affiche 2:3 d'un film ou d'une série, avec rang de tendance et progression de reprise. */
export const PosterCard: React.FC<PosterCardProps> = React.memo(({ item, progress, rank, poster, onOpen, className = 'w-[10.5rem]' }) => {
  const sources = [poster, item.logo].filter(Boolean) as string[]
  const [attempt, setAttempt] = useState(0)
  const src = sources[attempt]

  return (
    <button type="button" onClick={() => onOpen(item)} className={`tile group shrink-0 rounded-xl text-left ${className}`}>
      <div className="tile-frame aspect-[2/3] overflow-hidden rounded-xl bg-ink-850 ring-1 ring-white/6">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setAttempt((a) => a + 1)}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col justify-end bg-[linear-gradient(160deg,var(--color-ink-800),var(--color-ink-900))] p-3">
            <span className="font-wide text-lg font-bold leading-tight text-paper line-clamp-4">{item.cleanTitle}</span>
            <span className="streak mt-3 h-1 w-10 rounded-full" />
          </div>
        )}
        {rank ? (
          <span className="absolute left-2 top-2 rounded-md streak px-1.5 py-0.5 font-display text-[0.75rem] font-extrabold leading-none text-ink-950 tabular">
            N°{rank}
          </span>
        ) : null}
        {item.rating ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-ink-950/85 px-1.5 py-0.5 font-mono text-[0.7rem] font-bold text-paper">
            <Star className="size-3 fill-brand-yellow text-brand-yellow" />
            {item.rating.toFixed(1)}
          </span>
        ) : null}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 to-transparent px-2.5 pb-2.5 pt-6">
            <ProgressLine value={progress} className="h-[3px]" />
          </div>
        )}
      </div>
      <p className="mt-2.5 truncate px-0.5 text-[0.95rem] font-semibold text-paper">{item.cleanTitle}</p>
      <p className="truncate px-0.5 text-sm text-fog">{[item.year, item.category && categoryLabel(item.category)].filter(Boolean).join(' · ')}</p>
    </button>
  )
})
PosterCard.displayName = 'PosterCard'
