// Détourage du logo Moovo TV : « couleur vers transparence » sur le fond bleu nuit uni.
// Usage : node cutout.mjs <source.jpg> <dossier de sortie>
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [src, out] = process.argv.slice(2)
const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
  .toString().trim().split(',').map(Number)
const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 })

const BG = [5, 15, 44]
const FLOOR = 0.06 // grain et bruit JPEG du fond
const rgba = Buffer.alloc(W * H * 4)
for (let i = 0, j = 0; i < W * H; i++, j += 3) {
  let a = 0
  for (let c = 0; c < 3; c++) {
    const v = rgb[j + c], b = BG[c]
    // Logo lumineux sur fond sombre : seul ce qui est plus clair que le fond compte
    const ac = v > b ? (v - b) / (255 - b) : 0
    if (ac > a) a = ac
  }
  a = Math.max(0, Math.min(1, (a - FLOOR) / (1 - FLOOR)))
  const o = i * 4
  if (a > 0) {
    for (let c = 0; c < 3; c++) {
      const v = rgb[j + c], b = BG[c]
      rgba[o + c] = Math.max(0, Math.min(255, Math.round((v - b) / a + b)))
    }
  }
  rgba[o + 3] = Math.round(a * 255)
}

// Boîte englobante et séparation symbole / texte (colonne vide entre le « M » et « Moovo »)
const colMax = new Float32Array(W)
let top = H, bottom = 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = rgba[(y * W + x) * 4 + 3]
  if (a > colMax[x]) colMax[x] = a
  if (a > 20) { if (y < top) top = y; if (y > bottom) bottom = y }
}
let left = 0; while (colMax[left] <= 20) left++
let right = W - 1; while (colMax[right] <= 20) right--
// Le creux le plus net dans le tiers central-gauche sépare le symbole du mot
let split = -1, best = 1e9
for (let x = Math.round(W * 0.33); x < Math.round(W * 0.45); x++) if (colMax[x] < best) { best = colMax[x]; split = x }

writeFileSync(join(out, 'cutout.rgba'), rgba)
writeFileSync(join(out, 'meta.json'), JSON.stringify({ W, H, left, right, top, bottom, split, splitAlpha: best }, null, 2))
console.log({ W, H, left, right, top, bottom, split, splitAlpha: best })
