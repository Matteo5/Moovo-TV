import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isNativeApp, setupNative } from './native'

// Développement uniquement : catalogue de démonstration synthétique avec `?demo` (retiré des versions publiées)
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
  ? import('./dev/demoCatalog').then((m) => m.installDemoCatalog())
  : Promise.resolve()

// L'application native doit savoir si elle tourne sur un téléviseur avant le premier rendu
void Promise.all([setupNative(), demo]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Service worker : navigateur en production uniquement (inutile dans l'application native,
// et en dev il masquerait le rechargement à chaud)
if (import.meta.env.PROD && !isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Enregistrement du service worker impossible :', err)
    })
  })
}
