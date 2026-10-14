import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { createProxyHandler } from './proxy.ts'

/**
 * Serveur HTTP de Moovo TV : sert le build web (`dist/`) et le proxy `/api/proxy`.
 * Utilisé par `npm start` (server/index.ts) et par l'application Windows (electron/main.ts).
 */

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

async function resolveStaticFile(distDir: string, urlPath: string): Promise<string | null> {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const filePath = normalize(join(distDir, decoded))
  if (!filePath.startsWith(distDir)) return null
  try {
    const info = await stat(filePath)
    if (info.isFile()) return filePath
    if (info.isDirectory()) {
      const index = join(filePath, 'index.html')
      if ((await stat(index)).isFile()) return index
    }
  } catch {
    // Fichier absent : repli SPA plus bas.
  }
  return null
}

/** Serveur prêt à `listen()` : `distDir` est le dossier du build web (chemin absolu). */
export function createAppServer(distDir: string) {
  const proxyHandler = createProxyHandler()

  return createServer(async (req, res) => {
    const url = req.url || '/'

    if (url.startsWith('/api/proxy')) {
      await proxyHandler(req, res)
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.end()
      return
    }

    // Fichier demandé, sinon index.html (application monopage)
    const filePath = (await resolveStaticFile(distDir, url)) || join(distDir, 'index.html')
    const ext = extname(filePath)

    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (url.startsWith('/assets/')) {
      // Fichiers hashés par Vite : immuables
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      res.setHeader('Cache-Control', 'no-cache')
    }

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    createReadStream(filePath)
      .on('error', () => {
        res.statusCode = 404
        res.end('Build introuvable : lancez « npm run build » avant « npm start ».')
      })
      .pipe(res)
  })
}
