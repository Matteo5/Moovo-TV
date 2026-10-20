import React, { useState } from 'react'
import { RefreshCw, LogOut, Download, Upload, Eye, EyeOff, Trash2, Check, Monitor, Tv, Smartphone, Wand2 } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { DeviceModePreference } from '../types/iptv'
import { ACCENT_ORDER, ACCENT_THEMES } from '../types/theme'
import { getTmdbApiKey, setTmdbApiKey } from '../services/tmdbService'
import { Button } from '../ui/Button'
import { PlaybackSettings } from './PlaybackSettings'
import { CategorySettings } from './CategorySettings'
import { ParentalSettings } from './ParentalSettings'
import { clearTrendingCache } from '../services/trendingService'
import { nativePlatform } from '../native'

const SOURCE_LABELS = {
  m3u: 'Playlist M3U',
  xtream: 'Xtream Codes',
  stalker: 'Portail MAG / Stalker',
  enigma2: 'Décodeur Enigma2',
} as const

const DEVICE_OPTIONS: { id: DeviceModePreference; label: string; icon: React.ReactNode }[] = [
  { id: 'auto', label: 'Automatique', icon: <Wand2 className="size-4" /> },
  { id: 'tv', label: 'Téléviseur', icon: <Tv className="size-4" /> },
  { id: 'desktop', label: 'Ordinateur', icon: <Monitor className="size-4" /> },
  { id: 'mobile', label: 'Mobile', icon: <Smartphone className="size-4" /> },
]

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="grid gap-6 border-t border-white/6 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <div>
      <h2 className="font-wide text-xl font-bold tracking-tight">{title}</h2>
      {description && <p className="mt-2 text-sm leading-relaxed text-fog">{description}</p>}
    </div>
    <div className="min-w-0">{children}</div>
  </section>
)

const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-6">
    <dt className="w-40 shrink-0 text-sm text-fog">{label}</dt>
    <dd className={`min-w-0 break-all text-paper ${mono ? 'font-mono text-sm' : ''}`}>{value}</dd>
  </div>
)

const inputClass =
  'h-11 w-full rounded-xl bg-ink-850 px-4 text-paper placeholder:text-fog ring-1 ring-white/6 focus:outline-none focus:ring-2 focus:ring-accent'

const SettingsView: React.FC = () => {
  const s = useIptvStore()
  const [showSecret, setShowSecret] = useState(false)
  const [epgInput, setEpgInput] = useState(s.epgUrl || '')
  const [syncInput, setSyncInput] = useState(s.localSyncUrl)
  const [tmdbInput, setTmdbInput] = useState(getTmdbApiKey())
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3000)
  }

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const ok = s.importBackup(String(reader.result || ''))
      flash(ok ? 'Sauvegarde importée et fusionnée.' : 'Ce fichier n’est pas une sauvegarde Moovo TV valide.')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const secret = (value: string) => (showSecret ? value : '•'.repeat(Math.min(12, value.length)))
  const expDate = s.xtreamUserInfo?.expDate ? new Date(s.xtreamUserInfo.expDate) : null

  return (
    <div className="px-[var(--gutter)] pb-20 pt-6 md:pt-10">
      <h1 className="mt-1 font-xwide text-4xl font-extrabold tracking-tight md:text-5xl">Réglages</h1>

      {notice && (
        <p role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-ink-950 shadow-2xl animate-rise md:bottom-8">
          {notice}
        </p>
      )}

      <div className="mt-8 max-w-5xl">
        <Section title="Source" description="L’abonnement ou la playlist que Moovo TV lit en ce moment.">
          <dl>
            <Field label="Type" value={SOURCE_LABELS[s.connectionMode]} />
            {s.connectionMode === 'm3u' && <Field label="Adresse" value={s.playlistUrl?.replace(/^file:/, 'Fichier local · ') || '—'} mono />}
            {s.connectionMode === 'xtream' && s.xtreamCreds && (
              <>
                <Field label="Serveur" value={s.xtreamCreds.serverUrl} mono />
                <Field label="Identifiant" value={s.xtreamCreds.username} mono />
                <Field
                  label="Mot de passe"
                  mono
                  value={
                    <span className="inline-flex items-center gap-3">
                      {secret(s.xtreamCreds.password)}
                      <button type="button" onClick={() => setShowSecret((v) => !v)} className="rounded-lg p-1.5 text-fog hover:text-paper" aria-label={showSecret ? 'Masquer' : 'Afficher'}>
                        {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </span>
                  }
                />
                {s.xtreamUserInfo?.status && <Field label="Statut" value={s.xtreamUserInfo.status === 'Active' ? 'Actif' : s.xtreamUserInfo.status} />}
                {expDate && <Field label="Expire le" value={expDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} />}
                {s.xtreamUserInfo?.maxConnections && (
                  <Field label="Connexions" value={`${s.xtreamUserInfo.activeCons ?? 0} utilisée(s) sur ${s.xtreamUserInfo.maxConnections}`} />
                )}
              </>
            )}
            {s.connectionMode === 'stalker' && s.stalkerCreds && (
              <>
                <Field label="Portail" value={s.stalkerCreds.portalUrl} mono />
                <Field label="Adresse MAC" value={s.stalkerCreds.macAddress} mono />
              </>
            )}
            {s.connectionMode === 'enigma2' && s.enigmaCreds && (
              <>
                <Field label="Décodeur" value={s.enigmaCreds.hostUrl} mono />
                <Field label="Port des flux" value={String(s.enigmaCreds.streamPort || 8001)} mono />
              </>
            )}
            <Field
              label="Contenu"
              value={`${s.channels.length.toLocaleString('fr-FR')} chaîne${s.channels.length > 1 ? 's' : ''} · ${s.vodMovies.length.toLocaleString('fr-FR')} film${s.vodMovies.length > 1 ? 's' : ''} · ${s.vodSeries.length.toLocaleString('fr-FR')} série${s.vodSeries.length > 1 ? 's' : ''}`}
            />
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button icon={<RefreshCw className="size-4" />} onClick={() => s.reloadSource()}>
              Recharger la source
            </Button>
            <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => s.resetPlaylist()}>
              Changer de source
            </Button>
          </div>
        </Section>

        <Section title="Guide TV" description="Un fichier XMLTV fournit les programmes de la grille et le replay.">
          <p className="mb-4 text-sm">
            État :{' '}
            <span className={s.epgStatus === 'error' ? 'text-onair' : s.epgStatus === 'success' ? 'text-brand-cyan' : 'text-mist'}>
              {s.epgStatus === 'loading' ? 'chargement…' : s.epgStatus === 'success' ? 'guide chargé' : s.epgStatus === 'error' ? 'échec du chargement' : 'aucun guide'}
            </span>
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (epgInput.trim()) s.loadEpg(epgInput.trim())
            }}
          >
            <input value={epgInput} onChange={(e) => setEpgInput(e.target.value)} placeholder="https://exemple.com/guide.xml" className={inputClass} />
            <Button type="submit" disabled={s.epgStatus === 'loading'}>
              Charger
            </Button>
          </form>
          {s.xtreamCreds && (
            <Button className="mt-3" variant="ghost" icon={<Download className="size-4" />} onClick={() => s.loadProviderEpg()}>
              Utiliser le guide de mon fournisseur
            </Button>
          )}
        </Section>

        <Section
          title="Bouquets du direct"
          description="Masquez les bouquets que vous ne regardez jamais : leurs chaînes disparaissent du direct, du guide et du zapping. Les numéros des autres chaînes ne changent pas."
        >
          <CategorySettings />
        </Section>

        <Section title="Lecture" description="Tampon, langues, sous-titres et lecteur utilisé pour les films et séries.">
          <PlaybackSettings />
        </Section>

        <Section
          title="Contrôle parental"
          description="Un code à 4 chiffres protège les bouquets et les films que vous choisissez. Il reste demandé jusqu’à la fermeture de l’application."
        >
          <ParentalSettings inputClass={inputClass} onNotice={flash} />
        </Section>

        <Section title="Apparence" description="La couleur du focus et des repères, et la taille de l’interface.">
          <div className="grid gap-3 sm:grid-cols-2">
            {ACCENT_ORDER.map((id) => {
              const theme = ACCENT_THEMES[id]
              const selected = s.accentColor === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => s.setAccentColor(id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-4 rounded-2xl p-4 text-left ring-1 transition-colors ${
                    selected ? 'bg-ink-800 ring-white/20' : 'bg-ink-900 ring-white/5 hover:bg-ink-850'
                  }`}
                >
                  <span className="size-10 shrink-0 rounded-xl" style={{ background: theme.hex }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{theme.label}</span>
                    <span className="block truncate text-sm text-fog">{theme.hint}</span>
                  </span>
                  {selected && <Check className="size-5 text-paper" />}
                </button>
              )
            })}
          </div>

          <p className="mb-3 mt-8 text-sm text-fog">Affichage</p>
          <div className="flex flex-wrap gap-2">
            {DEVICE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => s.setDeviceModePreference(opt.id)}
                aria-pressed={s.deviceModePreference === opt.id}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 font-semibold ${
                  s.deviceModePreference === opt.id ? 'bg-paper text-ink-950' : 'bg-ink-800 text-mist hover:text-paper'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-fog">Le mode Téléviseur agrandit tout pour une lecture à distance et une navigation à la télécommande.</p>
        </Section>

        <Section
          title="Tendances et fiches (TMDB)"
          description="Avec une clé TMDB gratuite, l’accueil affiche les films et séries les plus regardés de la semaine présents dans votre abonnement, et les fiches incomplètes sont complétées."
        >
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              setTmdbApiKey(tmdbInput)
              clearTrendingCache()
              flash(tmdbInput.trim() ? 'Clé TMDB enregistrée.' : 'Clé TMDB retirée.')
            }}
          >
            <input value={tmdbInput} onChange={(e) => setTmdbInput(e.target.value)} placeholder="Clé API TMDB (v3)" className={`${inputClass} font-mono text-sm`} />
            <Button type="submit">Enregistrer</Button>
          </form>
          <p className="mt-3 text-sm text-fog">Créez un compte gratuit sur themoviedb.org, puis Paramètres › API › « Clé d’API (v3) ».</p>
        </Section>

        <Section title="Sauvegarde et synchronisation" description="Vos favoris, reprises de lecture et réglages, exportés dans un fichier ou partagés sur votre réseau local.">
          <div className="flex flex-wrap gap-3">
            <Button icon={<Download className="size-4" />} onClick={() => s.exportBackup()}>
              Exporter une sauvegarde
            </Button>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-xl bg-ink-800 px-5 font-semibold text-paper ring-1 ring-white/8 hover:bg-ink-700 focus-within:outline focus-within:outline-3 focus-within:outline-accent">
              <Upload className="size-4" />
              Importer
              <input type="file" accept=".json,application/json" onChange={onImport} className="sr-only" />
            </label>
          </div>

          <form
            className="mt-6 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              s.setLocalSyncUrl(syncInput)
              flash(syncInput.trim() ? 'Synchronisation activée.' : 'Synchronisation désactivée.')
            }}
          >
            <input value={syncInput} onChange={(e) => setSyncInput(e.target.value)} placeholder="http://192.168.1.10:3000" className={`${inputClass} font-mono text-sm`} />
            <Button type="submit">{syncInput.trim() ? 'Activer la synchro' : 'Désactiver'}</Button>
          </form>
          <p className="mt-3 text-sm text-fog">
            {nativePlatform === 'android'
              ? 'Dans l’application Android, la synchro récupère l’état du serveur au démarrage ; l’envoi des modifications n’est disponible que depuis le navigateur.'
              : 'Le serveur doit exposer GET et POST sur /api/sync.'}
          </p>
        </Section>

        <Section title="Télécommande et clavier">
          <dl className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
            {[
              ['0 – 9', 'Aller à une chaîne par son numéro'],
              ['Haut / Bas', 'Chaîne suivante / précédente (lecteur)'],
              ['Gauche', 'Liste des chaînes (lecteur)'],
              ['OK / Entrée', 'Afficher les commandes'],
              ['Retour / Échap', 'Fermer le lecteur ou la fiche'],
              ['Espace · M · F', 'Pause · Son · Plein écran'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-4 py-2">
                <dt className="w-32 shrink-0 font-mono text-sm text-accent">{key}</dt>
                <dd className="text-sm text-mist">{label}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Données" description="Tout est stocké uniquement sur cet appareil.">
          {confirmClear ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="w-full text-sm text-mist sm:w-auto">Effacer source, favoris, reprises et réglages ?</p>
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => s.clearCacheAndReload()}>
                Oui, tout effacer
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmClear(true)}>
              Effacer toutes les données
            </Button>
          )}
        </Section>
      </div>
    </div>
  )
}

export default SettingsView
