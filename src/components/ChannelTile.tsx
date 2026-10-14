import React from 'react'
import { Heart } from 'lucide-react'
import type { Channel } from '../types/iptv'
import { ChannelLogo } from '../ui/ChannelLogo'
import { ChannelNumber, ProgressLine, formatTime, programProgress } from '../ui/Program'
import { categoryLabel, channelCategory } from '../services/categoryService'

interface ChannelTileProps {
  channel: Channel
  isFavorite?: boolean
  now: number
  onPlay: (channel: Channel) => void
  size?: 'md' | 'lg'
}

/** Tuile 16:9 d'une chaîne : numéro OSD, logo, programme en cours. */
export const ChannelTile: React.FC<ChannelTileProps> = React.memo(({ channel, isFavorite, now, onPlay, size = 'md' }) => {
  const program = channel.currentProgram
  const progress = program ? programProgress(program, now) : null

  return (
    <button
      type="button"
      onClick={() => onPlay(channel)}
      className={`tile group shrink-0 text-left rounded-2xl ${size === 'lg' ? 'w-[19rem]' : 'w-[15.5rem]'}`}
    >
      <div className="tile-frame aspect-video rounded-2xl bg-ink-850 ring-1 ring-white/6 overflow-hidden group-focus-visible:ring-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgb(255_255_255/0.07),transparent_60%)]" />
        <ChannelLogo logo={channel.logo} name={channel.name} className="absolute inset-0 m-auto size-[62%] bg-transparent" />
        <ChannelNumber
          value={channel.number}
          className="absolute left-3 top-2.5 text-[0.8rem] text-mist group-focus-visible:text-accent"
        />
        {isFavorite && <Heart className="absolute right-3 top-3 size-3.5 fill-accent text-accent" aria-label="Favori" />}
        {progress !== null && (
          <ProgressLine value={progress} className="absolute inset-x-3 bottom-2.5 h-[3px]" />
        )}
      </div>
      <div className="px-1 pt-3">
        <p className="truncate font-semibold text-paper">{channel.name}</p>
        <p className="mt-0.5 truncate text-sm text-mist">
          {program ? (
            <>
              <span className="font-mono text-xs text-fog tabular">{formatTime(program.start)}</span> {program.title}
            </>
          ) : (
            categoryLabel(channelCategory(channel))
          )}
        </p>
      </div>
    </button>
  )
})
ChannelTile.displayName = 'ChannelTile'
