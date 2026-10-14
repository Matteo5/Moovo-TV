import muxjs from 'mux.js'

export interface TsPlayerSession {
  destroy: () => void
}

/**
 * Transmuxe un flux MPEG-TS (.ts) en flux MP4 fragmenté (fMP4) à la volée
 * et l'injecte dans un élément vidéo via MediaSource Extensions (MSE)
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
  let isDestroyed = false
  let mediaSource: MediaSource | null = null
  let sourceBuffer: SourceBuffer | null = null
  let transmuxer: any = null
  let abortController: AbortController | null = null
  const queue: Uint8Array[] = []

  const cleanup = () => {
    isDestroyed = true
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (transmuxer) {
      try {
        transmuxer.dispose()
      } catch {
        // ignore
      }
      transmuxer = null
    }
    if (mediaSource && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream()
      } catch {
        // ignore
      }
    }
  }

  // Vérifier le support de MediaSource
  if (!('MediaSource' in window)) {
    callbacks.onError?.(new Error('MediaSource n\'est pas supporté par ce navigateur.'))
    return { destroy: cleanup }
  }

  mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  videoElement.src = objectUrl

  const appendNextChunk = () => {
    if (isDestroyed || !sourceBuffer || sourceBuffer.updating || queue.length === 0) {
      return
    }
    // Direct sans fin : on libère ce qui est déjà vu pour ne pas saturer le quota MSE
    const buffered = sourceBuffer.buffered
    const now = videoElement.currentTime
    if (buffered.length > 0 && now - buffered.start(0) > 90) {
      try {
        sourceBuffer.remove(buffered.start(0), now - 30)
        return // « updateend » relancera l'ajout
      } catch {
        // Suppression refusée : on continue d'ajouter.
      }
    }
    try {
      const next = queue.shift()
      if (next) {
        sourceBuffer.appendBuffer(next as any)
      }
    } catch (e) {
      console.warn('Erreur appendBuffer MSE:', e)
    }
  }

  mediaSource.addEventListener('sourceopen', async () => {
    if (isDestroyed || !mediaSource) return

    try {
      // Configuration du transmuxer mux.js
      transmuxer = new muxjs.mp4.Transmuxer({
        remux: true,
      })

      transmuxer.on('data', (segment: { init: Uint8Array; data: Uint8Array }) => {
        if (isDestroyed || !mediaSource) return

        if (!sourceBuffer) {
          try {
            const mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
            if (MediaSource.isTypeSupported(mimeType)) {
              sourceBuffer = mediaSource.addSourceBuffer(mimeType)
            } else {
              sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.640029, mp4a.40.2"')
            }

            sourceBuffer.mode = 'sequence'

            sourceBuffer.addEventListener('updateend', () => {
              appendNextChunk()
            })

            sourceBuffer.addEventListener('error', (ev) => {
              console.warn('Erreur SourceBuffer:', ev)
            })

            if (segment.init) {
              queue.push(segment.init)
            }
          } catch (sbErr) {
            console.error('Impossible de créer SourceBuffer:', sbErr)
            callbacks.onError?.(sbErr instanceof Error ? sbErr : new Error(String(sbErr)))
            return
          }
        }

        if (segment.data) {
          queue.push(segment.data)
          appendNextChunk()
        }
      })

      abortController = new AbortController()
      callbacks.onWaiting?.()

      // Tentative de fetch avec gestion CORS
      let streamResponse: Response | null = null

      try {
        console.log('[TS Player] Tentative de lecture directe :', tsUrl)
        streamResponse = await fetch(tsUrl, {
          signal: abortController.signal,
          headers: {
            Accept: 'video/mp2t, video/*, */*',
          },
        })
      } catch (directErr) {
        console.warn('[TS Player] Échec direct, tentative via proxy CORS :', directErr)
        const proxiedTs = `/api/proxy?url=${encodeURIComponent(tsUrl)}`
        streamResponse = await fetch(proxiedTs, {
          signal: abortController.signal,
          headers: {
            Accept: 'video/mp2t, video/*, */*',
          },
        })
      }

      if (!streamResponse || !streamResponse.ok || !streamResponse.body) {
        throw new Error(`Flux TS inaccessible (Code ${streamResponse?.status || 'réseau'}).`)
      }

      callbacks.onReady?.()
      videoElement.play().catch(() => {})

      const reader = streamResponse.body.getReader()

      while (!isDestroyed) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && transmuxer) {
          transmuxer.push(value)
          transmuxer.flush()
        }
      }
    } catch (err: unknown) {
      if (!isDestroyed) {
        const message = err instanceof Error ? err.message : 'Erreur de flux TS'
        callbacks.onError?.(new Error(message))
      }
    }
  })

  return {
    destroy: () => {
      cleanup()
      URL.revokeObjectURL(objectUrl)
    },
  }
}
