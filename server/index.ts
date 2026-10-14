import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAppServer } from './app.ts'

/**
 * Serveur de production Moovo TV : sert le build `dist/` et expose le proxy `/api/proxy`.
 *
 *   npm run build && npm start          (PORT=8080 par défaut, HOST=0.0.0.0)
 *
 * Attention : le proxy relaie n'importe quelle URL http(s). À réserver au réseau local
 * ou à placer derrière une authentification si le serveur est exposé sur Internet.
 */

const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'
const DIST_DIR = resolve(fileURLToPath(new URL('../dist', import.meta.url)))

createAppServer(DIST_DIR).listen(PORT, HOST, () => {
  console.log(`Moovo TV prêt sur http://localhost:${PORT}`)
})
