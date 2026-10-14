import { app, BrowserWindow, Menu, shell } from 'electron'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { createAppServer } from '../server/app.ts'

/**
 * Application Windows Moovo TV.
 *
 * Le serveur de l'application (interface + proxy /api/proxy) tourne dans le processus principal, sur la
 * boucle locale du PC : les flux IPTV partent directement de la machine de l'utilisateur, rien n'est exposé
 * sur le réseau. Le port est fixe pour que les réglages (stockés par origine) soient retrouvés d'un lancement
 * à l'autre ; s'il est pris par un autre programme, on essaie les suivants.
 */

const BASE_PORT = 47811
const HOST = '127.0.0.1'

// Une seule fenêtre : un second lancement ramène la première au premier plan
if (!app.requestSingleInstanceLock()) app.quit()

// Lecture vidéo sans clic préalable (zapping, reprise)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null
let server: Server | null = null

function listen(port: number, attempt = 0): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const s = createAppServer(join(app.getAppPath(), 'dist'))
    s.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < 10) resolvePort(listen(port + 1, attempt + 1))
      else reject(err)
    })
    s.listen(port, HOST, () => {
      server = s
      resolvePort(port)
    })
  })
}

async function createWindow() {
  const port = await listen(BASE_PORT)
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Moovo TV',
    backgroundColor: '#030919',
    icon: join(app.getAppPath(), 'dist', 'icon-512.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  Menu.setApplicationMenu(null)
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Liens externes (TMDB, aide…) dans le navigateur, jamais dans la fenêtre de l'application
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // F11 : plein écran ; F12 : outils de développement pour diagnostiquer chez un testeur
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    } else if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  await mainWindow.loadURL(`http://${HOST}:${port}/`)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  server?.close()
  app.quit()
})
