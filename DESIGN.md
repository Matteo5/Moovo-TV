---
name: Moovo TV
description: Lecteur IPTV pensé télécommande d'abord, habillé de la nuit et de la traînée du logo Moovo.
colors:
  ink-950: "#030919"
  ink-900: "#071130"
  ink-850: "#0b173c"
  ink-800: "#111f4a"
  ink-700: "#1c2d5e"
  ink-600: "#2c4076"
  paper: "#f3f5ff"
  mist: "#aab5d8"
  fog: "#7482ad"
  brand-cyan: "#1ec8ff"
  brand-violet: "#9b6bff"
  brand-magenta: "#ff3ea5"
  brand-orange: "#ff8a1f"
  brand-yellow: "#ffd23f"
  onair: "#ff3d6e"
  accent-ink: "#001726"
typography:
  display:
    fontFamily: "Montserrat Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Montserrat Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Montserrat Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 700
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
  numeral:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "0.74rem"
    fontWeight: 500
    fontFeature: "tnum"
  rank:
    fontFamily: "Montserrat Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "7.6rem"
    fontWeight: 900
    lineHeight: 0.78
    letterSpacing: "-0.09em"
rounded:
  field: "0.8rem"
  poster: "0.9rem"
  button: "0.95rem"
  card: "1rem"
  wall: "1.125rem"
  tabbar: "1.95rem"
  full: "999px"
spacing:
  m-gutter: "1.25rem"
  wall-gap: "0.625rem"
  section: "3rem"
  m-tabbar: "calc(4.75rem + env(safe-area-inset-bottom))"
components:
  button-play:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-950}"
    rounded: "{rounded.button}"
    height: "3.25rem"
    padding: "0 0.75rem"
    typography: "{typography.title}"
  button-secondary:
    backgroundColor: "rgb(255 255 255 / 0.07)"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    height: "3.25rem"
    padding: "0 1rem"
  pill:
    backgroundColor: "rgb(255 255 255 / 0.07)"
    textColor: "{colors.mist}"
    rounded: "{rounded.full}"
    height: "2.25rem"
    padding: "0 1rem"
    typography: "{typography.label}"
  pill-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-950}"
    rounded: "{rounded.full}"
  field-search:
    backgroundColor: "rgb(255 255 255 / 0.08)"
    textColor: "{colors.paper}"
    rounded: "{rounded.field}"
    height: "2.75rem"
    padding: "0 2.5rem"
  bar-button:
    backgroundColor: "rgb(5 13 38 / 0.74)"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    size: "2.5rem"
  tab-bar:
    backgroundColor: "rgb(5 13 38 / 0.74)"
    textColor: "{colors.fog}"
    rounded: "{rounded.tabbar}"
    height: "3.9rem"
  poster:
    backgroundColor: "{colors.ink-850}"
    rounded: "{rounded.poster}"
    width: "7.75rem"
  wall-tile:
    backgroundColor: "{colors.ink-850}"
    rounded: "{rounded.wall}"
---

# Design System: Moovo TV

## Overview

**Creative North Star: "La nuit du logo, et sa traînée"**

Tout Moovo TV vient du logo fourni par le créateur : un fond de nuit bleue (#050F2C décliné en six profondeurs), un texte blanc froid, et la traînée du « M » qui file du cyan au jaune en passant par le violet, le magenta et l'orange. Cette traînée est la seule signature colorée du système ; elle ne décore jamais, elle désigne. Les titres prennent la géométrie du mot « Moovo » (Montserrat), la lecture passe par Atkinson Hyperlegible Next, les nombres par sa variante à chasse fixe.

Deux surfaces partagent cette base de jetons. Le monde **TV / ordinateur** (« régie TV », `src/app/Shell.tsx`, `src/views/*`, `src/components/*`, `src/ui/*`) est l'incumbent : rail latéral repliable, tuiles dont le focus est entouré de la traînée, mode TV agrandi pour la lecture à 3 m. Il n'est pas redécrit ici. Le monde **iPhone** (« Le Mur de collections », `src/mobile/*`, `html[data-device="mobile"]`) présente le catalogue comme un mur d'affiches de cinéma : grands titres Montserrat noirs très serrés, mosaïques de tailles mêlées qui changent de forme d'une collection à l'autre, Top 10 aux chiffres géants au trait. Il refuse la pile uniforme de rangées identiques des applis de streaming.

La matière reste sobre : nuit à plat, éclaircie seulement derrière le grand titre de l'accueil ; affiches sans cadre ; verre sombre réservé aux barres flottantes ; ombres douces qui décollent l'affiche du fond. La légèreté sur matériel modeste prime : le flou d'arrière-plan est coupé en mode TV, toutes les animations s'éteignent sous `prefers-reduced-motion`.

**Key Characteristics:**
- Nuit du logo en fond, blanc froid en texte, aucune autre teinte de surface.
- La traînée du M réservée aux rangs, à la progression et à la sélection (et au focus des tuiles en TV).
- Titres Montserrat 800-900 très serrés posés comme des titres d'affiche.
- Sur iPhone : murs d'affiches aux formes alternées, rails aimantés, barre d'onglets flottante en verre sombre.
- Données vraies ou rien : sans rang réel, pas de chiffre ; sans image, le titre posé sur la nuit.

## Colors

Une nuit bleue profonde, un blanc froid, et cinq couleurs de logo qui ne vivent qu'ensemble, en traînée.

### Primary
- **Traînée du M** (`--brand-gradient` : linear-gradient(100deg, brand-cyan 0 %, brand-violet 34 %, brand-magenta 58 %, brand-orange 82 %, brand-yellow 100 %)) : barres de progression de reprise, liseré sous l'onglet actif et sous le bouquet choisi, point du tri sélectionné, anneau de focus des tuiles (TV / ordinateur), fond du bouton principal TV.
- **Cyan de queue** (brand-cyan) : accent par défaut (`--accent`) : anneau `:focus-visible`, anneau des champs au focus, caret, sélection de texte. L'utilisateur peut basculer l'accent en magenta, orange ou jaune (`data-accent`), chaque variante avec son encre sombre (`--accent-ink`) et son halo à 16 %.

### Secondary
- **Couleurs du logo isolées** (brand-violet, brand-magenta, brand-orange, brand-yellow) : en dehors de la traînée, seulement comme petites teintes de pictogramme à sens fixe, partagées par les deux surfaces : étoile de note en jaune, cadenas du contrôle parental en magenta, pastille replay en cyan.

### Tertiary
- **Rouge antenne** (onair) : l'état « en direct » uniquement : point devant le nom de chaîne, barre d'avancement de l'émission en cours, messages d'erreur d'épisodes. La progression d'un programme en direct est en rouge antenne, celle d'une reprise film ou série en traînée ; les deux ne s'échangent pas.

### Neutral
- **Nuit profonde** (ink-950) : fond de page et de fiche, encre du bouton Lecture et des pastilles actives, intérieur des chiffres du Top 10.
- **Nuit moyenne** (ink-900, ink-850) : fond des images en attente et des vignettes sans image (ink-850), bas des dégradés de repli.
- **Nuit claire** (ink-800, ink-700, ink-600) : halo radial derrière le grand titre de l'accueil (ink-800), haut des dégradés de repli et des tuiles de genre, poignées des barres de défilement (ink-700 / ink-600).
- **Blanc froid** (paper) : titres, texte principal, fond du bouton Lecture et de la pastille sélectionnée.
- **Brume** (mist) : texte secondaire, résumé, actions « Tout voir » et Retour, pastilles inactives.
- **Brouillard** (fog) : métadonnées, compteurs, placeholders, onglets inactifs.
- **Voiles blancs** (blanc à 6-12 %) : fond des pastilles, champs, cartes du direct et boutons secondaires ; liseré 1 px à 6-10 % sur les cartes et le verre ; séparateurs à 6-8 %.

### Named Rules
**La règle de la traînée qui désigne.** La traînée du M n'apparaît que là où elle dit quelque chose : un rang, une progression, une sélection (ou le focus en TV). Jamais en fond de section, jamais en texte, jamais en bordure décorative.

**La règle de la nuit à plat.** Les surfaces sont la nuit du logo, à plat. Seul le haut de l'accueil reçoit un halo radial ink-800 à 70 % derrière son grand titre ; aucune autre teinte de surface n'est introduite.

## Typography

**Display Font:** Montserrat Variable (repli Segoe UI, system-ui)
**Body Font:** Atkinson Hyperlegible Next Variable (repli system-ui, -apple-system)
**Label/Mono Font:** Atkinson Hyperlegible Mono 500 / 700 (repli ui-monospace, SF Mono, Consolas)

**Character:** la géométrie ronde et lourde de Montserrat donne la voix d'affiche du logo ; Atkinson, dessinée pour la lisibilité, porte tout ce qui doit être lu vite, à 3 m comme sur un téléphone.

### Hierarchy
- **Display** (900, 3.25rem sur le titre d'accueil « Ce soir », 2.6rem sur les grands titres de page, 1.95rem sur le titre de fiche, interligne 0.92, −0.04 em) : grands titres de page et titres de fiche. En capitales sur les tuiles de mur et de genre à fond d'image (1.05-1.7rem), comme un titre imprimé sur une affiche.
- **Headline** (800, 1.45rem, interligne 1.05, −0.03 em) : titres de collection et de section (« Reprendre », « Épisodes », « Dans le même genre »).
- **Title** (Montserrat 700, 0.98rem) : titre de la barre compacte qui prend le relais du grand titre au défilement.
- **Body** (400, 0.95rem, interligne relâché) : résumé de fiche, texte d'aide ; titres d'affiche et de ligne en 600 à 0.82-0.95rem.
- **Label** (600, 0.66-0.86rem) : pastilles, onglets, métadonnées, actions. Pas de capitales espacées.
- **Numéraux** (Mono 500 / 700, chiffres tabulaires) : numéros de chaîne, heures, compteurs.
- **Rang** (Montserrat 900, 7.6rem en rangée Top 10, 6.2rem pour le n° 10, 5.5rem / 3.6rem sur le mur d'ouverture, interligne 0.78, −0.09 em) : chiffre au trait de 3.5 px, intérieur ink-950.

### Named Rules
**La règle de l'affiche.** Les titres se serrent (−0.03 à −0.04 em) et se lisent comme des titres d'affiche ; seuls les titres posés sur une image de fond passent en capitales. Une affiche qui porte déjà son titre imprimé n'en reçoit pas un second.

**La règle des chiffres justes.** Tout nombre qui se compare ou se met à jour (numéro de chaîne, heure, compteur) est en chiffres tabulaires.

## Layout

Le monde iPhone est une colonne unique au défilement vertical, marges latérales de 1.25rem (`--m-gutter`), le contenu réserve en bas la hauteur de la barre d'onglets flottante (`--m-tabbar` : 4.75rem + zone de sécurité) plus 2rem. Les sections s'espacent de 2.25 à 3rem (le plus souvent 3rem entre collections, 2.5-2.75rem dans le haut de l'accueil) ; un titre de section précède son contenu de 0.75-0.875rem.

Trois formes de mur se succèdent en alternance (lead, wide, quad, lead inversé) pour que deux collections voisines ne se ressemblent jamais, toutes à 0.625rem d'écart :
- **lead** : une affiche 2:3 sur deux rangs (colonne 1.3fr) et deux images paysage empilées à côté (1fr) ; `flip` inverse les côtés. Avec un seul titre, l'affiche seule centrée sur 2/3 de la largeur.
- **wide** : une image 16:9 pleine largeur, trois affiches 2:3 dessous.
- **quad** : quatre affiches 2:3 en carré.

Les rangées horizontales sont des rails aimantés (scroll-snap obligatoire, alignement au début, marges intérieures égales à la gouttière, défilement horizontal contenu, sans barre). Affiches de rangée à 7.75rem, cartes Reprendre et Direct à 15.5rem, affiches du Top 10 à 5.9rem.

Les marges du monde TV / ordinateur sont `--gutter` (1rem, 2.25rem dès 768 px, 3rem en TV contre l'overscan) ; l'échelle typographique y est pilotée par l'appareil (16 px, 15-18 px sur ordinateur, max(15 px, 1.6vw) en TV).

## Elevation & Depth

Hybride : la profondeur vient d'abord des tons (nuit à plat, voiles blancs translucides, dégradés vers ink-950 sous les titres posés sur image), puis de deux matières. Le **verre sombre** (nuit à 74 %, flou 22 px, saturation ×1.7) habille tout ce qui flotte au-dessus du contenu : barre d'onglets, barre compacte, boutons ronds de barre, menu de tri, pastilles de genre épinglées. Les **ombres** sont douces, longues et négatives (jamais décalées en bloc) et décollent une affiche ou un panneau du fond.

### Shadow Vocabulary
- **Affiche décollée** (`box-shadow: 0 1rem 2rem -0.75rem rgb(0 0 0 / 0.8)`) : affiches du Top 10, posées devant leur chiffre.
- **Panneau flottant** (`box-shadow: 0 1.5rem 3rem -1rem rgb(0 0 0 / 0.8)`) : menu de tri, affiche de la fiche (à 0.9).
- **Barre d'onglets** (`box-shadow: 0 1.25rem 2.5rem -0.75rem rgb(0 0 0 / 0.85)`) : la gélule flottante.
- **Chiffre sur image** (`drop-shadow(0 0.25rem 0.75rem rgb(0 0 0 / 0.6))`) : rangs imprimés sur le mur d'ouverture.

### Named Rules
**La règle du verre qui flotte.** Le flou d'arrière-plan est réservé aux éléments qui flottent au-dessus du contenu qui défile ; jamais sur une carte posée dans le flux. En mode TV il est coupé partout (coût GPU).

## Shapes

Coins arrondis proportionnés à la taille de l'objet : 18 px (1.125rem) sur les tuiles de mur et l'affiche de la fiche, 1-1.15rem sur les cartes et tuiles de genre, 0.95rem sur les boutons de fiche, 0.9rem sur les affiches de rangée et cartes Reprendre, 0.8-0.85rem sur les champs, 0.65-0.75rem sur les vignettes d'épisode et logos de chaîne. Gélule complète pour la barre d'onglets (1.95rem), pastilles, boutons ronds et actions rondes. La fiche s'arrondit à 1.5rem pendant qu'on la tire vers le bas. Les affiches n'ont ni cadre ni liseré ; seules les cartes à fond voilé reçoivent un liseré blanc 1 px à 6 %.

## Components

### Buttons
- **Lecture (bouton principal de fiche) :** plein blanc froid, texte nuit, Atkinson 700 à 1.02rem, hauteur 3.25rem, coins 0.95rem, icône Lecture pleine ; toujours en premier.
- **Secondaire (Ma liste) :** voile blanc 7 % (12 % une fois actif), liseré 1 px à 10-20 %, même hauteur et coins.
- **Actions rondes :** pastille de 3rem en voile 8 % avec liseré, libellé 0.74rem dessous ; actif = plein blanc froid.
- **Bouton de barre :** rond de 2.5rem en verre sombre avec liseré 10 %, pour profil, guide, recherche, fermeture de fiche.
- **Appui tactile :** tout élément touchable s'enfonce à 96.5 % en 220 ms sur la courbe `--ease-snap`.
- **Bouton principal TV (incumbent) :** fond en traînée, texte ink-950, éclairci au survol.

### Chips
- **Style :** pastilles défilantes de 2.25rem, gélule, Atkinson 600 à 0.86rem, voile blanc 7 % et texte brume ; compteur optionnel en mono tabulaire.
- **State :** sélectionnée = plein blanc froid, texte nuit. Les bouquets du direct sont une variante en texte seul, l'élu souligné d'un liseré de traînée de 3 px.

### Cards / Containers
- **Corner Style :** 1rem (cartes du direct), 1.15rem (bandeaux d'invitation, Ma liste).
- **Background :** voile blanc 5.5 % sur la nuit, liseré 1 px à 6 %.
- **Shadow Strategy :** aucune ombre dans le flux (voir Elevation & Depth).
- **Internal Padding :** 0.625-1rem.

### Inputs / Fields
- **Style :** voile blanc 8-9 %, sans bordure, coins 0.8-0.85rem, hauteur 2.75-3rem, loupe en brouillard à gauche, effacement à droite.
- **Focus :** anneau de 2 px à la couleur d'accent ; caret à l'accent.

### Navigation
- **Barre d'onglets flottante :** gélule de verre sombre de 3.9rem, à 0.75rem des bords et 0.5rem au-dessus de la zone de sécurité ; cinq onglets (Accueil, Films, Séries, Direct, Recherche) avec icône et libellé 0.66rem. Une pastille blanche à 12 % glisse sous l'onglet actif en 420 ms ; l'actif passe en blanc froid, trait d'icône épaissi, et reçoit un liseré de traînée de 3 × 20 px. Toucher l'onglet ouvert remonte en haut. Les pages secondaires (Ma liste, réglages, guide) restent rattachées à leur onglet parent.
- **Grand titre et barre compacte :** chaque page s'ouvre sur un grand titre Display ; passé 56 px de défilement, une barre compacte en verre apparaît en fondu (300 ms) avec le titre en Montserrat 700 centré et un séparateur 1 px. Les actions de page restent fixées en haut à droite.

### Mur de collections (signature)
Tuiles de mur sans cadre, coins 18 px. Les tuiles affiche (lead, poster) montrent l'affiche entière ; les tuiles paysage (small, wide) montrent l'image de fond avec le titre en Display capitales par-dessus un dégradé vers la nuit à 92 %. La tuile lead ajoute note (étoile jaune) et métadonnées. Le mur d'ouverture de l'accueil est un podium : n° 1 en lead, n° 2 et 3 à côté, chaque rang imprimé au trait ; sans rang réel, les trois derniers ajouts sans chiffre.

### Top 10 (mouvement signature)
Rail de chiffres géants au trait, chacun suivi de son affiche qui le chevauche. La couleur du trait parcourt la traînée du M sur dix pas, du cyan (n° 1) au jaune (n° 10) : #1ec8ff, #5aa6ff, #9b6bff, #c95ad6, #ff3ea5, #ff5f6c, #ff8a1f, #ffab2c, #ffd23f, #ffe27a. Le n° 10 est réduit pour tenir ses deux chiffres.

### Barre de progression de reprise
Piste de 3 px en blanc à 20 %, remplissage en traînée dont le dégradé est dimensionné sur la piste entière : la traînée se révèle au fil du film au lieu d'être compressée. Minimum visible 3 %.

### Fiche titre
Feuille plein écran qui monte de 2.5rem (420 ms) ; là où la transition de vue existe, l'affiche touchée devient l'affiche de la fiche (`m-poster`, 460 ms). Image d'ambiance de 21rem fondue vers la nuit, puis affiche et titre côte à côte, Lecture et Ma liste sur la même ligne. Glisser vers le bas depuis le haut la referme (au-delà de 110 px, résistance 0.55) ; un bouton rond chevron la ferme aussi. Au-delà de l'image, une barre compacte en verre porte le titre.

## Do's and Don'ts

### Do:
- **Do** réserver la traînée du M aux rangs, à la progression et à la sélection (et au focus des tuiles en TV).
- **Do** colorer chaque rang du Top 10 avec sa place sur la traînée, du cyan (n° 1) au jaune (n° 10), en chiffre au trait sur fond nuit.
- **Do** alterner les formes de mur (lead, wide, quad, lead inversé) d'une collection à la suivante.
- **Do** ouvrir chaque page iPhone sur un grand titre Display relayé par une barre compacte en verre au défilement.
- **Do** mettre la progression du direct en rouge antenne et celle des reprises en traînée.
- **Do** afficher le titre sur la nuit du logo quand une image manque, et aucun chiffre quand un rang n'est pas réel.
- **Do** faire enfoncer tout élément touchable (96.5 %, 220 ms, `--ease-snap`) et couper les animations sous `prefers-reduced-motion`.

### Don't:
- **Don't** empiler des rangées identiques d'affiches comme seule structure de page.
- **Don't** utiliser la traînée en fond de section, en texte ou en bordure décorative.
- **Don't** introduire une teinte de surface hors de la nuit du logo et des voiles blancs.
- **Don't** mettre de cadre ou de liseré autour d'une affiche, ni répéter un titre déjà imprimé sur l'affiche.
- **Don't** poser du flou d'arrière-plan sur un élément du flux, ni en mode TV.
- **Don't** redessiner ou recolorer le logo ; il est seulement détouré et cadré.
