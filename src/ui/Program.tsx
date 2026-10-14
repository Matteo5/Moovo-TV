import React from 'react'
import type { EpgProgram } from '../types/iptv'

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function programProgress(p: EpgProgram, now = Date.now()): number {
  const total = p.stop.getTime() - p.start.getTime()
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, ((now - p.start.getTime()) / total) * 100))
}

/** Fine ligne de progression d'une émission ou d'un film : la traînée du logo par défaut. */
export const ProgressLine: React.FC<{ value: number; className?: string; tone?: 'brand' | 'accent' | 'onair' | 'paper' }> = ({
  value,
  className = '',
  tone = 'brand',
}) => (
  <div className={`h-1 rounded-full bg-white/12 overflow-hidden ${className}`} role="presentation">
    <div
      className={`h-full rounded-full ${tone === 'onair' ? 'bg-onair' : tone === 'paper' ? 'bg-paper' : tone === 'accent' ? 'bg-accent' : 'streak'}`}
      // La traînée garde la largeur de la barre entière : elle se révèle au fil de la progression
      style={{ width: `${Math.round(value)}%`, ...(tone === 'brand' ? { backgroundSize: `${10000 / Math.max(value, 1)}% 100%` } : null) }}
    />
  </div>
)

/** Pastille « Direct » : la lampe rouge de l'antenne. */
export const OnAirDot: React.FC<{ label?: string; className?: string }> = ({ label = 'Direct', className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-onair ${className}`}>
    <span className="size-2 rounded-full bg-onair animate-onair shadow-[0_0_10px_var(--color-onair)]" />
    {label}
  </span>
)

/** Numéro de chaîne en chasse fixe, façon afficheur de téléviseur. */
export const ChannelNumber: React.FC<{ value?: number; className?: string }> = ({ value, className = '' }) =>
  value ? (
    <span className={`font-mono font-bold tabular tracking-tight ${className}`}>{String(value).padStart(3, '0')}</span>
  ) : null
