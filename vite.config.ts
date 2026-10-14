import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createProxyHandler } from './server/proxy.ts'

// Même proxy CORS qu'en production (server/index.ts), branché sur les serveurs dev et preview
function localProxyPlugin(): Plugin {
  const handler = createProxyHandler()
  return {
    name: 'moovo-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', (req, res) => void handler(req, res))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/proxy', (req, res) => void handler(req, res))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localProxyPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
    host: true,
  },
  build: {
    // hls.js pèse ~575 Ko à lui seul, mais n'est chargé qu'au lancement d'une lecture
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'hls', test: /node_modules[\\/]hls\.js[\\/]/ },
            { name: 'mux', test: /node_modules[\\/]mux\.js[\\/]/ },
          ],
        },
      },
    },
  },
})
