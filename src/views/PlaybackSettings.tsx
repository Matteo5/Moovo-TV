import React, { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  EXTERNAL_PLAYERS,
  LANGUAGE_CHOICES,
  setPlaybackPrefs,
  usePlaybackPrefs,
  type BufferProfile,
} from '../services/playbackPrefs'
import { getInstalledPlayers, hasExternalPlayers } from '../native'

const BUFFERS: { id: BufferProfile; label: string; hint: string }[] = [
  { id: 'short', label: 'Court', hint: 'Démarrage et zapping plus rapides' },
  { id: 'normal', label: 'Normal', hint: 'Bon équilibre (recommandé)' },
  { id: 'long', label: 'Long', hint: 'Plus stable sur une connexion irrégulière' },
]

const Option: React.FC<{ selected: boolean; onSelect: () => void; label: string; hint?: string }> = ({ selected, onSelect, label, hint }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    className={`flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 transition-colors ${
      selected ? 'bg-ink-800 ring-white/20' : 'bg-ink-900 ring-white/5 hover:bg-ink-850'
    }`}
  >
    <span className="min-w-0 flex-1">
      <span className="block font-semibold">{label}</span>
      {hint && <span className="block truncate text-sm text-fog">{hint}</span>}
    </span>
    {selected && <Check className="size-4 shrink-0 text-accent" />}
  </button>
)

const Group: React.FC<{ title: string; children: React.ReactNode; note?: string }> = ({ title, children, note }) => (
  <div className="mt-7 first:mt-0">
    <p className="mb-3 text-sm text-fog">{title}</p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    {note && <p className="mt-2 text-sm text-fog">{note}</p>}
  </div>
)

/** Réglages de lecture : tampon, langues, sous-titres, lecteur externe, guide automatique. */
export const PlaybackSettings: React.FC = () => {
  const prefs = usePlaybackPrefs()
  const [installed, setInstalled] = useState<string[] | null>(null)

  useEffect(() => {
    if (hasExternalPlayers) void getInstalledPlayers().then(setInstalled)
  }, [])

  const players = EXTERNAL_PLAYERS.filter(
    (p) => p.id === 'internal' || p.id === 'ask' || installed?.includes(p.id) || prefs.externalPlayer === p.id
  )

  return (
    <div>
      <Group title="Tampon vidéo">
        {BUFFERS.map((b) => (
          <Option key={b.id} selected={prefs.buffer === b.id} onSelect={() => setPlaybackPrefs({ buffer: b.id })} label={b.label} hint={b.hint} />
        ))}
      </Group>

      <Group title="Langue audio préférée (films, séries)" note="Appliquée quand le flux propose plusieurs langues ; modifiable pendant la lecture.">
        {LANGUAGE_CHOICES.map((l) => (
          <Option key={l.code || 'default'} selected={prefs.audioLang === l.code} onSelect={() => setPlaybackPrefs({ audioLang: l.code })} label={l.label} />
        ))}
      </Group>

      <Group title="Sous-titres par défaut">
        <Option selected={prefs.subtitleLang === 'off'} onSelect={() => setPlaybackPrefs({ subtitleLang: 'off' })} label="Désactivés" />
        {LANGUAGE_CHOICES.filter((l) => l.code).map((l) => (
          <Option key={l.code} selected={prefs.subtitleLang === l.code} onSelect={() => setPlaybackPrefs({ subtitleLang: l.code })} label={l.label} />
        ))}
      </Group>

      {hasExternalPlayers && (
        <Group
          title="Lecteur des films et séries"
          note={
            installed && installed.length === 0
              ? 'Aucun lecteur externe détecté (VLC, Nova, MX Player, Just Player…). « Choisir à chaque fois » propose ceux installés.'
              : 'Avec un lecteur externe, la reprise de lecture est gérée par ce lecteur.'
          }
        >
          {players.map((p) => (
            <Option key={p.id} selected={prefs.externalPlayer === p.id} onSelect={() => setPlaybackPrefs({ externalPlayer: p.id })} label={p.label} />
          ))}
        </Group>
      )}

      <Group title="Guide TV du fournisseur Xtream">
        <Option selected={prefs.autoProviderEpg} onSelect={() => setPlaybackPrefs({ autoProviderEpg: true })} label="Charger automatiquement" hint="Au démarrage, si aucun guide n’est défini" />
        <Option selected={!prefs.autoProviderEpg} onSelect={() => setPlaybackPrefs({ autoProviderEpg: false })} label="Ne pas charger" hint="Conseillé sur les appareils peu puissants" />
      </Group>
    </div>
  )
}
