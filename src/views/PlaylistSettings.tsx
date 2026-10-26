import React, { useState } from 'react'
import { Check, KeyRound, Lock, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { Button } from '../ui/Button'
import { PLAYLIST_TYPES, sortedPlaylists } from './PlaylistPicker'

/** oldPin : code actuel, exigé pour changer ou retirer le code d'une autre playlist que celle en cours */
type Editing = { id: string; field: 'name' | 'pin'; value: string; oldPin?: string } | null

/**
 * Réglages › Playlists : passer d'un abonnement à l'autre, les renommer, les protéger par un code, les retirer.
 * Toute source qui s'est connectée une fois figure ici.
 */
export const PlaylistSettings: React.FC<{ inputClass: string; onNotice: (message: string) => void }> = ({ inputClass, onNotice }) => {
  const s = useIptvStore()
  const [editing, setEditing] = useState<Editing>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const playlists = sortedPlaylists(s.playlists)

  const save = () => {
    if (!editing) return
    if (editing.field === 'name') {
      s.renamePlaylist(editing.id, editing.value)
      onNotice('Playlist renommée.')
    } else {
      const target = s.playlists.find((p) => p.id === editing.id)
      if (target?.pin && editing.oldPin !== undefined && editing.oldPin !== target.pin) return onNotice('Code actuel incorrect.')
      const pin = editing.value.replace(/\D/g, '')
      if (pin && pin.length !== 4) return onNotice('Le code doit faire 4 chiffres.')
      s.setPlaylistPin(editing.id, pin)
      onNotice(pin ? 'Code enregistré : il sera demandé à l’ouverture.' : 'Code retiré.')
    }
    setEditing(null)
  }

  return (
    <div>
      <ul className="divide-y divide-white/6 rounded-2xl bg-ink-900/60 ring-1 ring-white/5">
        {playlists.map((p) => {
          const active = p.id === s.activePlaylistId
          const isEditing = editing?.id === p.id
          return (
            <li key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-accent [&>svg]:size-5">
                  {PLAYLIST_TYPES[p.mode].icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{p.name}</span>
                    {p.pin && <Lock className="size-4 shrink-0 text-brand-magenta" aria-label="Protégée par un code" />}
                  </span>
                  <span className="block text-sm text-fog">
                    {PLAYLIST_TYPES[p.mode].label}
                    {active ? ' · en cours' : ''}
                  </span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {!active && (
                    <Button size="sm" variant="primary" icon={<Play className="size-4" />} onClick={() => void s.openPlaylist(p.id)}>
                      Ouvrir
                    </Button>
                  )}
                  <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing({ id: p.id, field: 'name', value: p.name })}>
                    Renommer
                  </Button>
                  <Button size="sm" icon={<KeyRound className="size-4" />} onClick={() => setEditing({ id: p.id, field: 'pin', value: '', oldPin: p.pin && !active ? '' : undefined })}>
                    {p.pin ? 'Code' : 'Protéger'}
                  </Button>
                  {confirmRemove === p.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 className="size-4" />}
                        onClick={() => {
                          s.removePlaylist(p.id)
                          setConfirmRemove(null)
                          onNotice('Playlist retirée de la liste.')
                        }}
                      >
                        Oui, retirer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                        Annuler
                      </Button>
                    </>
                  ) : (
                    !active && (
                      <Button size="sm" variant="ghost" aria-label={`Retirer ${p.name}`} icon={<Trash2 className="size-4" />} onClick={() => setConfirmRemove(p.id)} />
                    )
                  )}
                </div>
              </div>

              {isEditing && (
                <form
                  className="mt-4 flex flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    save()
                  }}
                >
                  {editing.oldPin !== undefined && (
                    <input
                      autoFocus
                      value={editing.oldPin}
                      onChange={(e) => setEditing({ ...editing, oldPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      inputMode="numeric"
                      placeholder="Code actuel"
                      aria-label="Code actuel de la playlist"
                      className={`${inputClass} font-mono tracking-[0.3em]`}
                    />
                  )}
                  <input
                    autoFocus={editing.oldPin === undefined}
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: editing.field === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value })}
                    inputMode={editing.field === 'pin' ? 'numeric' : 'text'}
                    placeholder={editing.field === 'pin' ? (p.pin ? 'Nouveau code (vide pour le retirer)' : 'Code à 4 chiffres') : 'Nom de la playlist'}
                    aria-label={editing.field === 'pin' ? 'Code de la playlist' : 'Nom de la playlist'}
                    className={`${inputClass} ${editing.field === 'pin' ? 'font-mono tracking-[0.3em]' : ''}`}
                  />
                  <Button type="submit" icon={<Check className="size-4" />}>
                    Enregistrer
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    Annuler
                  </Button>
                </form>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button icon={<Plus className="size-4" />} onClick={() => s.resetPlaylist()}>
          Ajouter une playlist
        </Button>
        <button
          type="button"
          role="switch"
          aria-checked={s.playlistAskAtStartup}
          onClick={() => s.setPlaylistAskAtStartup(!s.playlistAskAtStartup)}
          className="inline-flex h-11 items-center gap-3 rounded-xl px-4 font-semibold text-mist hover:bg-white/6 hover:text-paper"
        >
          <span className={`relative h-6 w-11 rounded-full transition-colors ${s.playlistAskAtStartup ? 'bg-accent' : 'bg-ink-700'}`}>
            <span className={`absolute top-1 size-4 rounded-full bg-paper transition-[left] ${s.playlistAskAtStartup ? 'left-6' : 'left-1'}`} />
          </span>
          Choisir la playlist au démarrage
        </button>
      </div>
      <p className="mt-3 text-sm text-fog">
        Favoris, bouquets masqués et contrôle parental sont communs à toutes les playlists. Une playlist protégée demande son code à chaque ouverture.
      </p>
    </div>
  )
}
