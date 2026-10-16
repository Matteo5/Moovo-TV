import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Application native Moovo-TV (Android / Android TV, iPhone / iPad).
 * L'interface web (dist/) est embarquée ; le proxy /api/proxy est assuré par le code natif
 * (android/app/src/main/java/tv/moovo/app/NativeProxy.java, ios/App/App/NativeProxy.swift).
 */
const config: CapacitorConfig = {
  appId: 'tv.moovo.app',
  appName: 'Moovo TV',
  webDir: 'dist',
  backgroundColor: '#030919',
  server: {
    // Schéma http : les flux IPTV sont presque tous en http, une page https les bloquerait (contenu mixte)
    androidScheme: 'http',
    cleartext: true,
    // Mise au point sur TV : interface servie par le serveur de dev du PC via « adb reverse tcp:5173 tcp:5173 »
    ...(process.env.MOOVO_LIVE === '1' ? { url: 'http://localhost:5173' } : {}),
  },
  android: {
    allowMixedContent: true,
    // Inspection à distance (chrome://inspect) : utile pour la mise au point sur TV, à couper ensuite
    webContentsDebuggingEnabled: process.env.MOOVO_DEBUG === '1',
    // Pas d'écran de chargement blanc entre le lanceur et l'interface
    backgroundColor: '#030919',
  },
  ios: {
    // Schéma capacitor:// imposé par iOS (http interdit) : le proxy natif passe par son gestionnaire
    backgroundColor: '#030919',
    allowsLinkPreview: false,
    // Inspection à distance depuis Safari du Mac (menu Développement)
    webContentsDebuggingEnabled: process.env.MOOVO_DEBUG === '1',
  },
  plugins: {
    SystemBars: {
      // L'interface gère elle-même les encoches via env(safe-area-inset-*) (viewport-fit=cover)
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
}

export default config
