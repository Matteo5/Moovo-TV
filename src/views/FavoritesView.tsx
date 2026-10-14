import React, { useMemo } from 'react'
import { Heart, Radio } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { useNow } from '../hooks/useNow'
import { ChannelTile } from '../components/ChannelTile'
import { PosterGrid } from '../components/PosterGrid'
import { Button } from '../ui/Button'

const FavoritesView: React.FC = () => {
  const channels = useIptvStore((s) => s.channels)
  const favorites = useIptvStore((s) => s.favorites)
  const vodMovies = useIptvStore((s) => s.vodMovies)
  const vodSeries = useIptvStore((s) => s.vodSeries)
  const setActiveChannel = useIptvStore((s) => s.setActiveChannel)
  const openVodDetail = useIptvStore((s) => s.openVodDetail)
  const setCurrentView = useIptvStore((s) => s.setCurrentView)
  const now = useNow()

  const favSet = useMemo(() => new Set(favorites), [favorites])
  const favChannels = useMemo(() => channels.filter((c) => favSet.has(c.id)), [channels, favSet])
  const favVod = useMemo(() => [...vodMovies, ...vodSeries].filter((v) => favSet.has(v.id)), [vodMovies, vodSeries, favSet])

  return (
    <div className="px-[var(--gutter)] pb-16 pt-6 md:pt-10">
      <h1 className="mt-1 font-xwide text-4xl font-extrabold tracking-tight md:text-5xl">Vos favoris</h1>

      {favChannels.length === 0 && favVod.length === 0 && (
        <div className="mt-16 max-w-lg">
          <Heart className="size-10 text-accent" />
          <p className="mt-5 font-wide text-2xl font-bold">Rien ici pour l’instant</p>
          <p className="mt-2 text-mist">
            Ajoutez une chaîne avec le cœur dans sa fiche ou pendant la lecture, et un film ou une série avec « Ma liste ».
          </p>
          <Button className="mt-7" variant="primary" icon={<Radio className="size-5" />} onClick={() => setCurrentView('live')}>
            Parcourir les chaînes
          </Button>
        </div>
      )}

      {favChannels.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-5 font-wide text-xl font-bold">
            Chaînes <span className="ml-2 font-mono text-sm font-medium text-fog">{favChannels.length}</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-x-4 gap-y-6">
            {favChannels.map((c) => (
              <div key={c.id} className="[&>button]:w-full">
                <ChannelTile channel={c} now={now} isFavorite onPlay={setActiveChannel} />
              </div>
            ))}
          </div>
        </section>
      )}

      {favVod.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 font-wide text-xl font-bold">
            Ma liste <span className="ml-2 font-mono text-sm font-medium text-fog">{favVod.length}</span>
          </h2>
          <PosterGrid items={favVod} onOpen={openVodDetail} />
        </section>
      )}
    </div>
  )
}

export default FavoritesView
