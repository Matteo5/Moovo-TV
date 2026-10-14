// Lancé automatiquement avant `npm run dev` : installe les dépendances au premier lancement
// pour qu'un simple `git clone` + `npm run dev` suffise.
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`\nMoovo TV a besoin de Node.js 22.12 ou plus récent (version actuelle : ${process.versions.node}).`)
  console.error('Téléchargez la version LTS sur https://nodejs.org puis relancez `npm run dev`.\n')
  process.exit(1)
}

if (!existsSync('node_modules/vite')) {
  console.log('\nPremier lancement : installation des dépendances (1 à 2 minutes)…\n')
  execSync('npm install', { stdio: 'inherit' })
}
