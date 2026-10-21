/**
 * Catalogue de démonstration SYNTHÉTIQUE, pour vérifier l'interface sans abonnement.
 * Chargé uniquement par le serveur de développement avec `?demo` (voir main.tsx) : jamais dans une version publiée.
 * Titres et chaînes inventés, affiches dessinées ici : à ne jamais présenter comme de vraies données.
 */
import { useIptvStore } from '../store/useIptvStore'
import type { Channel, EpgProgram, VodItem } from '../types/iptv'
import { epgService } from '../services/epgService'

const PALETTE = [
  ['#0b3b4d', '#1c2d5e'],
  ['#3a1c5e', '#5e1c3f'],
  ['#4d2a0b', '#2c1a10'],
  ['#0f3d2e', '#0b173c'],
  ['#5e1c2a', '#1c0f2e'],
  ['#1c3a5e', '#0b173c'],
  ['#4a3a0b', '#3a1c0b'],
  ['#2a1c5e', '#0b2a3d'],
]

function art(title: string, i: number, w: number, h: number): string {
  const [a, b] = PALETTE[i % PALETTE.length]
  // Affiche : titre imprimé comme sur une vraie ; image de fond : sans texte
  const words = w > h ? [] : title.toUpperCase().split(' ')
  const size = 46
  const lines = words.map((word, k) => `<text x="${w * 0.08}" y="${h * 0.62 + k * size * 1.02}" font-family="Montserrat,Arial" font-weight="900" font-size="${size}" fill="#f3f5ff" letter-spacing="-2">${word}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r" cx="0.75" cy="0.2" r="0.7"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#r)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.28}" fill="#000" opacity="0.18"/>${lines}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const MOVIES: [string, string, number, string][] = [
  ['Les Marées Noires', 'Thriller', 7.9, '2025'],
  ['Orbite Basse', 'Science-fiction', 8.3, '2025'],
  ['Le Dernier Phare', 'Drame', 7.4, '2024'],
  ['Brise Glace', 'Action', 6.9, '2025'],
  ['Minuit à Lisbonne', 'Romance', 7.1, '2023'],
  ['La Meute', 'Thriller', 7.6, '2024'],
  ['Cendres', 'Drame', 8.0, '2025'],
  ['Vitesse Limite', 'Action', 6.5, '2024'],
  ['Les Enfants du Vent', 'Animation', 8.4, '2025'],
  ['Au-delà des Dunes', 'Science-fiction', 7.8, '2023'],
  ['Le Pacte', 'Thriller', 7.0, '2022'],
  ['Petits Arrangements', 'Comédie', 6.8, '2025'],
  ['Station Zéro', 'Science-fiction', 7.2, '2024'],
  ['Le Gardien', 'Action', 7.3, '2025'],
  ['Comme Avant', 'Comédie', 6.4, '2024'],
  ['Nuit Blanche', 'Thriller', 7.7, '2025'],
  ['Le Voyage de Lou', 'Animation', 7.9, '2024'],
  ['Dernier Round', 'Action', 7.1, '2023'],
  ['Les Héritiers', 'Drame', 7.5, '2025'],
  ['Mauvaise Pioche', 'Comédie', 6.6, '2025'],
  ['Signal Perdu', 'Science-fiction', 7.0, '2025'],
  ['Le Silence des Lacs', 'Drame', 7.8, '2024'],
  ['Opération Faucon', 'Action', 6.7, '2024'],
  ['Double Jeu', 'Thriller', 7.2, '2023'],
  ['Les Vacances de Paul', 'Comédie', 6.3, '2024'],
  ['Le Royaume Gelé', 'Animation', 7.6, '2023'],
  ['La Fracture', 'Drame', 7.3, '2025'],
  ['Sous Pression', 'Thriller', 6.9, '2024'],
  ['Éclipse', 'Science-fiction', 8.1, '2025'],
  ['Coup de Foudre à Nice', 'Comédie', 6.5, '2025'],
  ['Horizon Zéro', 'Science-fiction', 7.4, '2025'],
  ['La Maison du Port', 'Drame', 7.0, '2024'],
  ['Point de Rupture', 'Action', 6.8, '2025'],
  ['Les Copains d’Abord', 'Comédie', 6.7, '2024'],
]

const SERIES: [string, string, number, string][] = [
  ['Les Ombres de Paris', 'Policier', 8.2, '2025'],
  ['Colonie', 'Science-fiction', 8.0, '2024'],
  ['Famille Moreau', 'Comédie', 7.1, '2025'],
  ['Le Bureau Noir', 'Policier', 8.5, '2023'],
  ['Hautes Terres', 'Drame', 7.7, '2025'],
  ['Code Rouge', 'Action', 7.0, '2024'],
  ['La Ferme', 'Drame', 7.4, '2025'],
  ['Les Voisins', 'Comédie', 6.9, '2024'],
  ['Capitale', 'Policier', 7.8, '2025'],
  ['Les Derniers Jours', 'Science-fiction', 7.6, '2025'],
]

function vod(list: [string, string, number, string][], type: 'movie' | 'series'): VodItem[] {
  const now = Date.now()
  return list.map(([title, category, rating, year], i) => ({
    id: `${type === 'movie' ? 'demo_vod' : 'demo_series'}_${i}`,
    name: title,
    cleanTitle: title,
    type,
    streamUrl: type === 'movie' ? `https://example.invalid/demo/${i}.mkv` : '',
    streamId: i,
    category,
    logo: art(title, i + (type === 'series' ? 3 : 0), 400, 600),
    backdrop: art(title, i + 5, 1280, 720),
    rating,
    year,
    overview: `${title} : résumé de démonstration, rédigé pour vérifier la mise en page de la fiche sur un écran de téléphone. Le vrai résumé vient du fournisseur ou de TMDB. Ce second paragraphe allonge volontairement le texte pour tester la coupure en quatre lignes, le bouton « Lire la suite » et le défilement de la fiche sous la barre compacte.`,
    director: 'Réalisation de démonstration',
    cast: 'Distribution de démonstration, premier rôle, second rôle, troisième rôle',
    addedAt: now - i * 86_400_000,
  }))
}

const CHANNELS: [string, string, string][] = [
  ['Antenne 1', 'FR | Généralistes', 'Le journal de 20 h'],
  ['Antenne 2', 'FR | Généralistes', 'Jeu : Questions pour tous'],
  ['Antenne 3', 'FR | Généralistes', 'Météo régionale'],
  ['Cinéma Club', 'FR | Cinéma', 'Film : Les Marées Noires'],
  ['Info Continu', 'FR | Info', 'Édition spéciale'],
  ['Sport Plus', 'FR | Sport', 'Football : Ligue 1'],
  ['Sport Plus 2', 'FR | Sport', 'Tennis : Masters'],
  ['Découverte', 'FR | Documentaires', 'Les grands fonds marins'],
  ['Kids Zone', 'FR | Jeunesse', 'Dessins animés'],
  ['Musique Live', 'FR | Musique', 'Concert du soir'],
  ['World News', 'UK | News', 'World Report'],
  ['Deportes Uno', 'ES | Deportes', 'Liga en directo'],
]

function channels(): Channel[] {
  const now = Date.now()
  // Plusieurs exemplaires de chaque chaîne : des listes assez longues pour tester le défilement à la télécommande
  const all = Array.from({ length: 6 }, (_, k) => CHANNELS.map(([name, group, title]) => [k ? `${name} ${k + 1}` : name, group, title] as const)).flat()
  return all.map(([name, group, title], i) => {
    const start = new Date(now - (10 + i * 7) * 60_000)
    const stop = new Date(start.getTime() + (45 + i * 5) * 60_000)
    return {
      id: `demo_ch_${i}`,
      name,
      streamUrl: `https://example.invalid/live/${i}.m3u8`,
      url: `https://example.invalid/live/${i}.m3u8`,
      category: group,
      group,
      number: i + 1,
      currentProgram: { channelId: `demo_ch_${i}`, title, start, stop },
    }
  })
}

/** Grille de démonstration : une émission par heure sur chaque chaîne, d'hier à demain. */
function demoGuide(list: Channel[]) {
  const programs = (epgService as unknown as { programsByChannel: Map<string, EpgProgram[]> }).programsByChannel
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  for (const c of list) {
    const items: EpgProgram[] = []
    for (let h = -24; h < 48; h++) {
      const start = new Date(from.getTime() + h * 3600_000)
      items.push({ channelId: c.id, title: `${c.currentProgram?.title ?? 'Émission'} (${start.getHours()} h)`, start, stop: new Date(start.getTime() + 3600_000) })
    }
    programs.set(c.id, items)
  }
}

export function installDemoCatalog() {
  const list = channels()
  demoGuide(list)
  const counts: Record<string, number> = {}
  for (const c of list) counts[c.group] = (counts[c.group] || 0) + 1
  const movies = vod(MOVIES, 'movie')
  const now = Date.now()
  useIptvStore.setState({
    initialize: async () => {
      useIptvStore.setState({
        channels: list,
        categories: Object.keys(counts),
        categoryCounts: counts,
        vodMovies: movies,
        vodSeries: vod(SERIES, 'series'),
        status: 'success',
        favorites: ['demo_ch_0', 'demo_ch_5', 'demo_vod_1', 'demo_series_3'],
        vodResumePoints: {
          demo_vod_2: { id: 'demo_vod_2', currentTime: 2400, duration: 6600, updatedAt: now - 3_600_000 },
          demo_vod_8: { id: 'demo_vod_8', currentTime: 900, duration: 5400, updatedAt: now - 7_200_000 },
          demo_series_0_ep_3: { id: 'demo_series_0_ep_3', currentTime: 1300, duration: 2700, updatedAt: now - 1_800_000 },
        },
      })
    },
  } as never)
}
