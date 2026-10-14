/* Service worker Moovo-TV : coquille applicative hors ligne + cache des affiches.
 * Les flux vidéo, playlists et appels API (/api/*) ne sont jamais mis en cache. */

const VERSION = 'moovo-v3'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const IMAGE_CACHE = `${VERSION}-images`
const MAX_IMAGES = 400

const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.png', '/brand/moovo-logo.webp', '/brand/moovo-mark.webp', '/brand/moovo-wordmark.webp', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => cache.add('/')))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

async function trimCache(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Jamais de cache pour le proxy, les flux et les requêtes partielles (Range)
  if (url.pathname.startsWith('/api/') || request.headers.has('range')) return

  // Navigation : réseau d'abord, coquille en cache si hors ligne
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Fichiers hashés de Vite : cache d'abord (immuables)
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy))
            }
            return res
          })
      )
    )
    return
  }

  // Affiches TMDB et polices Google : stale-while-revalidate, cache plafonné
  if (url.hostname === 'image.tmdb.org' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(request)
        const network = fetch(request)
          .then((res) => {
            if (res.ok || res.type === 'opaque') {
              cache.put(request, res.clone()).then(() => trimCache(IMAGE_CACHE, MAX_IMAGES))
            }
            return res
          })
          .catch(() => hit)
        return hit || network
      })
    )
  }
})
