import React, { useMemo } from 'react'
import { CalendarClock, ChevronRight, Settings2 } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { Channel, VodItem } from '../types/iptv'
import { useVisibleVod } from '../hooks/useParentalFilter'
import { ChannelLogo } from '../ui/ChannelLogo'
import { LargeTitle, Poster, SectionTitle } from './parts'

const LinkRow: React.FC<{ icon: React.ReactNode; label: string; detail?: string; onClick: () => void }> = ({ icon, label, detail, onClick }) => (
  <button type="button" onClick={onClick} className="m-press flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.65rem] bg-white/[0.08] text-paper">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[0.95rem] font-semibold text-paper">{label}</span>
      {detail && <span className="block truncate text-[0.8rem] text-fog">{detail}</span>}
    </span>
    <ChevronRight className="size-5 text-fog" />
  </button>
)

/** Ma liste : titres gardés, chaînes favorites, et l'accès aux réglages. */
const MobileLibrary: React.FC = () => {
  const favorites = useIptvStore((s) => s.favorites)
  const channels = useIptvStore((s) => s.channels)
  const vodMovies = useVisibleVod(useIptvStore((s) => s.vodMovies)).visible
  const vodSeries = useVisibleVod(useIptvStore((s) => s.vodSeries)).visible
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const connectionMode = useIptvStore((s) => s.connectionMode)

  const favSet = useMemo(() => new Set(favorites), [favorites])
  const myVod = useMemo(() => [...vodMovies, ...vodSeries].filter((v) => favSet.has(v.id)), [vodMovies, vodSeries, favSet])
  const myChannels = useMemo(() => channels.filter((c) => favSet.has(c.id)), [channels, favSet])

  const sourceName = { m3u: 'Playlist M3U', xtream: 'Xtream Codes', stalker: 'Portail MAG', enigma2: 'Décodeur Enigma2' }[connectionMode]

  return (
    <div className="pb-[calc(var(--m-tabbar)+2rem)]">
      <LargeTitle title="Ma liste" onBack={() => setCurrentView('home')} backLabel="Accueil" />

      <section className="mt-6">
        {myVod.length > 0 ? (
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 px-[var(--m-gutter)] phone-landscape:grid-cols-6">
            {myVod.map((it: VodItem) => (
              <Poster key={it.id} item={it} className="w-full" />
            ))}
          </div>
        ) : (
          <div className="mx-[var(--m-gutter)] rounded-[1.15rem] bg-white/[0.045] p-5 ring-1 ring-white/[0.06]">
            <p className="m-heading text-[1.15rem]">Rien dans votre liste pour l’instant</p>
            <p className="mt-1.5 text-[0.88rem] leading-relaxed text-mist">Sur la fiche d’un film ou d’une série, touchez « Ma liste » pour le retrouver ici.</p>
          </div>
        )}
      </section>

      {myChannels.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Chaînes favorites" detail={`${myChannels.length} chaîne${myChannels.length > 1 ? 's' : ''}`} />
          <ul className="mt-2">
            {myChannels.map((c: Channel) => (
              <li key={c.id}>
                <button type="button" onClick={() => setActiveChannel(c)} className="m-press flex w-full items-center gap-3 px-[var(--m-gutter)] py-2 text-left">
                  <ChannelLogo logo={c.logo} name={c.name} className="size-11 shrink-0 rounded-[0.7rem]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-semibold">{c.name}</span>
                    {c.currentProgram && <span className="block truncate text-[0.8rem] text-mist">{c.currentProgram.title}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-[var(--m-gutter)] mt-10 divide-y divide-white/[0.06] overflow-hidden rounded-[1.15rem] bg-white/[0.045] ring-1 ring-white/[0.06]">
        <LinkRow icon={<CalendarClock className="size-[1.1rem]" />} label="Guide TV" detail="Programmes et replay" onClick={() => setCurrentView('epg')} />
        <LinkRow icon={<Settings2 className="size-[1.1rem]" />} label="Réglages" detail={`Source : ${sourceName} · lecture · contrôle parental`} onClick={() => setCurrentView('settings')} />
      </section>
    </div>
  )
}

export default MobileLibrary
