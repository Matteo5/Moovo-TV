import React from 'react'
import { ChevronRight } from 'lucide-react'

interface RowProps {
  title: string
  meta?: React.ReactNode
  onSeeAll?: () => void
  children: React.ReactNode
}

/** Rangée horizontale défilante, navigable à la télécommande. */
export const Row: React.FC<RowProps> = ({ title, meta, onSeeAll, children }) => (
  <section className="animate-rise">
    <div className="mb-4 flex items-end justify-between gap-4 px-[var(--gutter)]">
      <h2 className="font-wide text-xl font-bold tracking-tight text-paper">
        {title}
        {meta && <span className="ml-3 font-mono text-sm font-medium text-fog tabular">{meta}</span>}
      </h2>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-mist hover:text-paper"
        >
          Tout voir <ChevronRight className="size-4" />
        </button>
      )}
    </div>
    <div className="no-scrollbar -my-4 flex gap-4 overflow-x-auto px-[var(--gutter)] py-4 scroll-px-[var(--gutter)]">
      {children}
    </div>
  </section>
)
