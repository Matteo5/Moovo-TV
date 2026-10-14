import React, { useState } from 'react'

// Teintes de secours reprises de la mire, attribuées de façon stable selon le nom
const FALLBACK_TINTS = [
  'from-brand-cyan/30 to-brand-violet/10 text-brand-cyan',
  'from-brand-yellow/30 to-onair/10 text-brand-yellow',
  'from-brand-magenta/30 to-brand-violet/10 text-brand-magenta',
  'from-brand-cyan/30 to-brand-cyan/10 text-brand-cyan',
  'from-onair/30 to-brand-magenta/10 text-onair',
  'from-brand-violet/35 to-brand-cyan/10 text-[#8ea2ff]',
]

function hashName(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return Math.abs(hash)
}

function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'TV'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

interface ChannelLogoProps {
  logo?: string
  name: string
  className?: string
}

export const ChannelLogo: React.FC<ChannelLogoProps> = ({ logo, name, className = 'size-14' }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = logo && failedSrc !== logo

  if (!showImage) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br font-wide font-extrabold tracking-tight select-none ${
          FALLBACK_TINTS[hashName(name) % FALLBACK_TINTS.length]
        } ${className}`}
        aria-hidden="true"
      >
        <span className="text-sm leading-none">{initialsOf(name)}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center rounded-xl bg-ink-800/80 overflow-hidden ${className}`}>
      <img
        src={logo}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(logo)}
        className="max-h-[78%] max-w-[78%] object-contain drop-shadow-[0_2px_6px_rgb(0_0_0/0.5)]"
      />
    </div>
  )
}
