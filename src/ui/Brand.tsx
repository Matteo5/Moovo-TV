import React from 'react'

// Logo Moovo TV détouré (public/brand) : le symbole « M » seul, le mot « Moovo TV » seul, ou le logo complet
const MARK_SRC = '/brand/moovo-mark.webp'
const WORDMARK_SRC = '/brand/moovo-wordmark.webp'
const LOGO_SRC = '/brand/moovo-logo.webp'

/** Symbole « M » du logo. Les images étant carrées avec leur halo, la taille se règle par la hauteur. */
export const BrandMark: React.FC<{ className?: string; pulse?: boolean }> = ({ className = 'h-10', pulse = false }) => (
  <img src={MARK_SRC} alt="" aria-hidden="true" draggable={false} className={`aspect-square w-auto select-none ${pulse ? 'animate-brand-pulse' : ''} ${className}`} />
)

/** Mot « Moovo TV » seul, à placer à côté du symbole (menu latéral déplié). */
export const BrandWordmark: React.FC<{ className?: string }> = ({ className = 'h-6' }) => (
  <img src={WORDMARK_SRC} alt="Moovo TV" draggable={false} className={`w-auto select-none ${className}`} />
)

/** Logo complet ; `compact` n'affiche que le symbole. */
export const Wordmark: React.FC<{ compact?: boolean; className?: string }> = ({ compact, className = 'h-9' }) =>
  compact ? (
    <BrandMark className={className} />
  ) : (
    <img src={LOGO_SRC} alt="Moovo TV" draggable={false} className={`w-auto select-none ${className}`} />
  )

/** Écran d'attente plein cadre : le symbole Moovo TV qui « cherche le signal ». */
export const SignalLoader: React.FC<{ title: string; detail?: string; progress?: number | null }> = ({
  title,
  detail,
  progress,
}) => (
  <div className="min-h-dvh w-full flex flex-col items-center justify-center bg-ink-950 px-6 text-center">
    <BrandMark pulse className="mb-8 h-28" />
    <p className="font-wide text-2xl font-bold tracking-tight text-paper">{title}</p>
    {detail && <p className="mt-3 max-w-md text-mist">{detail}</p>}
    {typeof progress === 'number' && (
      <div className="mt-8 w-64">
        <div className="h-1 rounded-full bg-ink-700 overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 font-mono text-sm text-fog tabular">{progress} %</p>
      </div>
    )}
  </div>
)
