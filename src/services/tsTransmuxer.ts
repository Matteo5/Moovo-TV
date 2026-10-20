import mpegts from 'mpegts.js'

export interface TsPlayerSession {
  destroy: () => void
}

/**
 * Lit un flux MPEG-TS (.ts) en direct via mpegts.js : démultiplexage, remultiplexage en MP4 fragmenté
 * et injection dans l'élément vidéo par MediaSource Extensions (ManagedMediaSource sur iPhone, iOS 17.1+).
 * L'ancien pipeline mux.js vidait le transmuxer à chaque morceau réseau : trous dans le tampon, image figée.
 */
export function playTsWithMux(
  videoElement: HTMLVideoElement,
  tsUrl: string,
  callbacks: {
    onReady?: () => void
    onError?: (err: Error) => void
    onWaiting?: () => void
  }
): TsPlayerSession {
  if (!mpegts.getFeatureList().mseLivePlayback) {
    callbacks.onError?.(new Error('MediaSource n\'est pas supporté par ce navigateur.'))
    return { destroy: () => {} }
  }

  // ManagedMediaSource n'accepte d'être attaché que si AirPlay est désactivé sur l'élément
  if (!window.MediaSource) videoElement.disableRemotePlayback = true

  let destroyed = false
  const player = mpegts.createPlayer(
    { type: 'mpegts', isLive: true, url: tsUrl },
    {
      // Le worker ne passerait pas par le gestionnaire capacitor:// du proxy natif (iPhone)
      enableWorker: false,
      lazyLoad: false,
      // Direct sans fin : on libère ce qui est déjà vu pour ne pas saturer le quota MSE
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 60,
      autoCleanupMinBackwardDuration: 30,
      // Saute les petits trous de l'horodatage du fournisseur
      fixAudioTimestampGap: true,
    }
  )

  // mpegts.js peut signaler plusieurs erreurs d'affilée : une seule remonte (le moteur passe alors à la méthode suivante)
  let failed = false
  player.on(mpegts.Events.ERROR, (type: string, detail: string) => {
    if (destroyed || failed) return
    failed = true
    callbacks.onError?.(new Error(`Flux TS illisible (${type} · ${detail}).`))
  })
  player.on(mpegts.Events.MEDIA_INFO, () => {
    if (!destroyed) callbacks.onReady?.()
  })

  callbacks.onWaiting?.()
  player.attachMediaElement(videoElement)
  player.load()

  return {
    destroy: () => {
      destroyed = true
      try {
        player.pause()
        player.unload()
        player.detachMediaElement()
        player.destroy()
      } catch {
        // Déjà libéré
      }
    },
  }
}
