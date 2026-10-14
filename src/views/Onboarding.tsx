import React, { useState } from 'react'
import { Link2, Server, Cpu, Satellite, Eye, EyeOff, RefreshCw, FileUp, ArrowRight, ChevronDown } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import type { ConnectionMode } from '../types/iptv'
import { DEMO_PLAYLISTS } from '../services/playlistService'
import { generateRandomMac } from '../services/stalkerService'
import { Wordmark } from '../ui/Brand'
import { Button } from '../ui/Button'

const SOURCES: { id: ConnectionMode; title: string; detail: string; icon: React.ReactNode }[] = [
  { id: 'xtream', title: 'Xtream Codes', detail: 'Serveur, identifiant, mot de passe', icon: <Server className="size-6" /> },
  { id: 'm3u', title: 'Playlist M3U', detail: 'Lien ou fichier .m3u / .m3u8', icon: <Link2 className="size-6" /> },
  { id: 'stalker', title: 'Portail MAG', detail: 'Adresse du portail et MAC', icon: <Cpu className="size-6" /> },
  { id: 'enigma2', title: 'Enigma2', detail: 'Décodeur satellite du réseau local', icon: <Satellite className="size-6" /> },
]

const inputClass =
  'h-14 w-full rounded-2xl bg-ink-850 px-5 text-lg text-paper placeholder:text-fog ring-1 ring-white/8 focus:outline-none focus:ring-2 focus:ring-accent'

const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode; hint?: string }> = ({ htmlFor, children, hint }) => (
  <label htmlFor={htmlFor} className="mb-2 flex items-baseline justify-between gap-4 text-sm font-semibold text-mist">
    {children}
    {hint && <span className="font-normal text-fog">{hint}</span>}
  </label>
)

export const Onboarding: React.FC = () => {
  const store = useIptvStore()
  const { connectionMode, setConnectionMode, errorMessage, status } = store

  const [m3uUrl, setM3uUrl] = useState(store.playlistUrl && !store.playlistUrl.startsWith('file:') ? store.playlistUrl : '')
  const [server, setServer] = useState(store.xtreamCreds?.serverUrl || '')
  const [username, setUsername] = useState(store.xtreamCreds?.username || '')
  const [password, setPassword] = useState(store.xtreamCreds?.password || '')
  const [showPassword, setShowPassword] = useState(false)
  const [portal, setPortal] = useState(store.stalkerCreds?.portalUrl || '')
  const [mac, setMac] = useState(store.stalkerCreds?.macAddress || generateRandomMac())
  const [enigmaHost, setEnigmaHost] = useState(store.enigmaCreds?.hostUrl || '')
  const [enigmaPort, setEnigmaPort] = useState(String(store.enigmaCreds?.streamPort || 8001))
  const [epgUrl, setEpgUrl] = useState(store.epgUrl || '')

  const loading = status === 'loading'
  const epg = epgUrl.trim() || undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (connectionMode === 'm3u') store.loadPlaylist(m3uUrl.trim(), epg)
    if (connectionMode === 'xtream') store.loadXtream({ serverUrl: server.trim(), username: username.trim(), password: password.trim() }, epg)
    if (connectionMode === 'stalker') store.loadStalker({ portalUrl: portal.trim(), macAddress: mac.trim().toUpperCase() }, epg)
    if (connectionMode === 'enigma2') store.loadEnigma({ hostUrl: enigmaHost.trim(), streamPort: parseInt(enigmaPort, 10) || 8001 }, epg)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => store.loadFromLocalFile(String(reader.result || ''), file.name, epg)
    reader.readAsText(file)
  }

  return (
    <div className="min-h-dvh bg-ink-950 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] tv:grid tv:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
      {/* Manifeste */}
      <aside className="relative flex flex-col overflow-hidden bg-ink-900 px-[var(--gutter)] pb-10 pt-[max(2rem,env(safe-area-inset-top))] lg:sticky lg:top-0 lg:h-dvh lg:pb-0 tv:sticky tv:top-0 tv:h-dvh tv:pb-0">
        {/* Lueurs de la traînée du logo : magenta en haut, cyan en bas */}
        <div className="absolute -right-40 -top-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_62_165/0.2),transparent)]" />
        <div className="absolute -bottom-48 -left-40 size-[32rem] rounded-full bg-[radial-gradient(closest-side,rgb(30_200_255/0.16),transparent)]" />
        <Wordmark className="relative -ml-3 h-14 self-start md:h-16" />
        <div className="relative mt-14 lg:mt-auto tv:mt-auto">
          <h1 className="mt-4 font-xwide text-[clamp(2.8rem,6.4vw,5.8rem)] tv:text-[3.4rem] font-extrabold leading-[0.9] tracking-[-0.035em]">
            Branchez
            <br />
            votre source.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-mist">
            Chaînes en direct, guide TV, films et séries de votre abonnement, sur la télé, l’ordinateur ou le téléphone.
          </p>
        </div>
        <div className="relative mt-10 lg:mb-10 lg:mt-14 tv:mb-8 tv:mt-10">
          <div className="streak h-3 w-full rounded-full" />
          <p className="mt-4 text-sm text-fog">Vos accès restent sur cet appareil. Rien n’est envoyé à un service tiers.</p>
        </div>
      </aside>

      {/* Configuration */}
      <main className="px-[var(--gutter)] pb-16 pt-10 lg:py-[max(3.5rem,6vh)] tv:pt-[var(--gutter)]">
        <div className="mx-auto max-w-2xl">
          <h2 className="flex items-baseline gap-3 font-wide text-xl font-bold">
            <span className="font-mono text-sm text-accent">1</span> Type de source
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {SOURCES.map((src) => {
              const selected = connectionMode === src.id
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setConnectionMode(src.id)}
                  aria-pressed={selected}
                  data-autofocus={selected || undefined}
                  className={`tile tile-frame flex flex-col items-start gap-4 rounded-2xl p-5 text-left ring-1 ${
                    selected ? 'bg-paper text-ink-950 ring-paper' : 'bg-ink-900 text-paper ring-white/6 hover:bg-ink-850'
                  }`}
                >
                  <span className={selected ? 'text-ink-950' : 'text-accent'}>{src.icon}</span>
                  <span>
                    <span className="block font-wide text-lg font-bold leading-tight">{src.title}</span>
                    <span className={`mt-1 block text-sm ${selected ? 'text-ink-700' : 'text-fog'}`}>{src.detail}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <h2 className="mt-12 flex items-baseline gap-3 font-wide text-xl font-bold">
            <span className="font-mono text-sm text-accent">2</span> Vos accès
          </h2>

          <form onSubmit={submit} className="mt-5 space-y-5">
            {connectionMode === 'm3u' && (
              <>
                <div>
                  <FieldLabel htmlFor="m3u">Adresse de la playlist</FieldLabel>
                  <input id="m3u" type="url" inputMode="url" value={m3uUrl} onChange={(e) => setM3uUrl(e.target.value)} placeholder="https://…/playlist.m3u" className={inputClass} />
                </div>
                <label className="flex h-14 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-mist hover:border-white/30 hover:text-paper focus-within:outline focus-within:outline-3 focus-within:outline-accent">
                  <FileUp className="size-5" />
                  Ou importer un fichier .m3u depuis cet appareil
                  <input type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain" onChange={onFile} className="sr-only" />
                </label>
              </>
            )}

            {connectionMode === 'xtream' && (
              <>
                <div>
                  <FieldLabel htmlFor="server" hint="avec le port, ex. :8080">Adresse du serveur</FieldLabel>
                  <input id="server" inputMode="url" autoComplete="url" value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://serveur.exemple.com:8080" className={inputClass} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="user">Identifiant</FieldLabel>
                    <input id="user" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="pass">Mot de passe</FieldLabel>
                    <div className="relative">
                      <input
                        id="pass"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputClass} pr-14`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-xl text-fog hover:text-paper"
                      >
                        {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {connectionMode === 'stalker' && (
              <>
                <div>
                  <FieldLabel htmlFor="portal" hint="souvent terminée par /c/">Adresse du portail</FieldLabel>
                  <input id="portal" inputMode="url" value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="http://portail.exemple.com/c/" className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="mac" hint="celle déclarée chez votre fournisseur">Adresse MAC</FieldLabel>
                  <div className="flex gap-3">
                    <input id="mac" value={mac} onChange={(e) => setMac(e.target.value)} className={`${inputClass} font-mono uppercase`} />
                    <Button size="lg" aria-label="Générer une adresse MAC" icon={<RefreshCw className="size-5" />} onClick={() => setMac(generateRandomMac())} className="h-14 shrink-0" />
                  </div>
                </div>
              </>
            )}

            {connectionMode === 'enigma2' && (
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div>
                  <FieldLabel htmlFor="host">Adresse du décodeur</FieldLabel>
                  <input id="host" inputMode="url" value={enigmaHost} onChange={(e) => setEnigmaHost(e.target.value)} placeholder="http://192.168.1.50" className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="sport">Port des flux</FieldLabel>
                  <input id="sport" inputMode="numeric" value={enigmaPort} onChange={(e) => setEnigmaPort(e.target.value)} className={`${inputClass} font-mono`} />
                </div>
              </div>
            )}

            <details className="group rounded-2xl bg-ink-900/60 ring-1 ring-white/5">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-5 py-4 text-sm font-semibold text-mist hover:text-paper">
                Guide des programmes (facultatif)
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5">
                <input value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} placeholder="https://…/guide.xml" className={`${inputClass} h-12 text-base`} />
                <p className="mt-2 text-sm text-fog">Avec Xtream Codes, le guide du fournisseur peut aussi être chargé plus tard depuis l’onglet Guide TV.</p>
              </div>
            </details>

            {errorMessage && (
              <p role="alert" className="rounded-2xl bg-onair/10 px-5 py-4 text-onair ring-1 ring-onair/30">
                {errorMessage}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" disabled={loading} className="w-full" icon={<ArrowRight className="size-5" />}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>

          <section className="mt-14 border-t border-white/6 pt-10">
            <h2 className="font-wide text-lg font-bold">Pas d’abonnement sous la main ?</h2>
            <p className="mt-1 text-sm text-fog">Ces playlists publiques et gratuites (iptv-org) permettent d’essayer l’application.</p>
            <div className="mt-5 grid gap-2">
              {DEMO_PLAYLISTS.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  disabled={loading}
                  onClick={() => store.loadPlaylist(demo.url, epg)}
                  className="tile tile-frame flex items-center gap-4 rounded-2xl bg-ink-900 px-5 py-4 text-left ring-1 ring-white/5 hover:bg-ink-850"
                >
                  <span className="w-20 shrink-0 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">{demo.badge}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{demo.title}</span>
                    <span className="block truncate text-sm text-fog">{demo.description}</span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-fog" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
