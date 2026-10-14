import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Volume2, VolumeX, Maximize2, Search } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { Channel } from '../types/iptv'
import { startPlayback, type EngineSession } from './engine'
import { resolvePlaybackSource } from './source'
import { useBackHandler, goBack } from '../hooks/useBackHandler'
import { ChannelLogo } from '../ui/ChannelLogo'
import { BrandMark } from '../ui/Brand'
import { ChannelNumber } from '../ui/Program'

const Cell: React.FC<{
  channel: Channel | null
  audio: boolean
  onSelect: () => void
  onPick: () => void
  onRemove: () => void
  onExpand: () => void
}> = ({ channel, audio, onSelect, onPick, onRemove, onExpand }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [buffering, setBuffering] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !channel) return
    setFailed(false)
    let cancelled = false
    let session: EngineSession | null = null
    void resolvePlaybackSource(channel).then((source) => {
      if (cancelled) return
      session = startPlayback(video, source, { onBuffering: setBuffering, onAttempt: () => {}, onFatal: () => setFailed(true) })
    })
    return () => {
      cancelled = true
      session?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !audio
  }, [audio])

  if (!channel) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 text-mist hover:border-white/25 hover:text-paper"
      >
        <Plus className="size-8" />
        <span className="font-semibold">Ajouter une chaîne</span>
      </button>
    )
  }

  return (
    <div className={`group relative size-full overflow-hidden rounded-2xl bg-black ring-2 ${audio ? 'ring-accent' : 'ring-transparent'}`}>
      <video ref={videoRef} playsInline autoPlay muted={!audio} className="size-full object-contain" />
      {buffering && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <BrandMark pulse className="h-14" />
        </div>
      )}
      {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-mist">Flux indisponible</p>}
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent p-3">
        <ChannelLogo logo={channel.logo} name={channel.name} className="size-8 shrink-0" />
        <ChannelNumber value={channel.number} className="text-xs text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{channel.name}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/85 to-transparent p-2">
        <button type="button" onClick={onSelect} aria-label={audio ? 'Son actif' : 'Écouter cette chaîne'} className={`flex size-10 items-center justify-center rounded-full ${audio ? 'bg-accent text-accent-ink' : 'bg-white/10 hover:bg-white/20'}`}>
          {audio ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <button type="button" onClick={onPick} aria-label="Changer de chaîne" className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <Search className="size-5" />
        </button>
        <button type="button" onClick={onExpand} aria-label="Regarder en plein écran" className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <Maximize2 className="size-5" />
        </button>
        <button type="button" onClick={onRemove} aria-label="Retirer" className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

const Picker: React.FC<{ onPick: (c: Channel) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const channels = useIptvStore((s) => s.channels)
  const [q, setQ] = useState('')
  useBackHandler(true, onClose)
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = query ? channels.filter((c) => c.name.toLowerCase().includes(query) || String(c.number) === query) : channels
    return list.slice(0, 80)
  }, [channels, q])

  return (
    <div data-nav-trap className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Fermer" data-nav-skip onClick={() => goBack()} className="absolute inset-0 cursor-default" />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl bg-ink-900 p-5 ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-wide text-lg font-bold">Choisir une chaîne</p>
          <button type="button" onClick={() => goBack()} aria-label="Fermer" className="flex size-10 items-center justify-center rounded-full bg-white/8 hover:bg-white/15">
            <X className="size-5" />
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom ou numéro de chaîne"
          className="h-12 rounded-xl bg-ink-850 px-4 text-paper placeholder:text-fog ring-1 ring-white/8 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-white/6">
              <ChannelNumber value={c.number} className="w-10 text-sm text-fog" />
              <ChannelLogo logo={c.logo} name={c.name} className="size-9 shrink-0" />
              <span className="truncate font-semibold">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Mur d'écrans 2×2 : jusqu'à quatre directs, un seul son à la fois. */
export const Multiview: React.FC<{ initial: Channel; onClose: () => void }> = ({ initial, onClose }) => {
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const [slots, setSlots] = useState<(Channel | null)[]>([initial, null, null, null])
  const [audio, setAudio] = useState(0)
  const [picking, setPicking] = useState<number | null>(null)

  useBackHandler(true, onClose)

  return (
    <div data-nav-trap className="fixed inset-0 z-[60] flex flex-col bg-ink-950 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:p-5">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="font-wide text-lg font-bold">Multiview</p>
        <button type="button" onClick={() => goBack()} className="flex size-11 items-center justify-center rounded-full bg-white/8 hover:bg-white/15" aria-label="Quitter le multiview">
          <X className="size-5" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-4 gap-3 md:grid-cols-2 md:grid-rows-2">
        {slots.map((channel, i) => (
          <Cell
            key={i}
            channel={channel}
            audio={audio === i}
            onSelect={() => setAudio(i)}
            onPick={() => setPicking(i)}
            onRemove={() => setSlots((s) => s.map((c, j) => (j === i ? null : c)))}
            onExpand={() => {
              if (!channel) return
              onClose()
              setActiveChannel(channel)
            }}
          />
        ))}
      </div>
      {picking !== null && (
        <Picker
          onClose={() => setPicking(null)}
          onPick={(c) => {
            setSlots((s) => s.map((x, j) => (j === picking ? c : x)))
            setAudio(picking)
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}
