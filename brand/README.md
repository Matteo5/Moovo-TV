# Marque Moovo TV

- `moovo-logo-source.jpg` : logo d'origine (ne pas modifier).
- Déclinaisons générées : `public/brand/` (logo complet, symbole, mot détourés), icônes web (`public/icon-*.png`, `favicon.png`),
  icônes Android, bannière Fire TV et écrans de démarrage (`android/app/src/main/res/`).

Régénérer après un changement de logo (Node + ffmpeg) :

```bash
mkdir -p /tmp/moovo-logo && cp brand/moovo-logo-source.jpg /tmp/moovo-logo/source.jpg
node scripts/brand/cutout.mjs /tmp/moovo-logo/source.jpg /tmp/moovo-logo
bash scripts/brand/make-assets.sh /tmp/moovo-logo .
```

Le détourage convertit le fond bleu nuit (#050F2C) en transparence : le halo reste semi-transparent.
Les cadrages de `make-assets.sh` (boîte du logo, séparation symbole / texte) sont ceux que `cutout.mjs` affiche.
