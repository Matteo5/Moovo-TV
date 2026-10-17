---
version: 1
slug: "src-mobile-mobileshell-tsx"
primary_target: "src/mobile/MobileShell.tsx"
related_targets: ["src/mobile"]
---

# Surface : application iPhone (mode mobile)

Scope : toute l'interface en mode `mobile` (iPhone d'abord), rendue par `src/mobile/`. Modes TV et ordinateur inchangés (décision de l'utilisateur).
Mode : Operate (parcourir le catalogue, lancer, reprendre).
Audience et usage : le créateur et ses proches, sur iPhone, surtout films et séries (réponse de l'utilisateur) ; le direct reste à deux appuis.
À éviter absolument : une appli « trop sage » qui ressemble à toutes les applis de streaming (réponse de l'utilisateur).
Fonctions à garder : reprise, Ma liste, favoris, tendances TMDB, univers du direct, guide, recherche, réglages, contrôle parental, lecteur VLC natif pour les films sur iOS.

## Direction contract

THESIS : le catalogue de l'abonnement présenté comme un mur d'affiches de cinéma, en collections éditoriales à grands titres et mosaïques de tailles mêlées ; refuse la pile uniforme de rangées identiques façon Netflix.

OWN-WORLD : nuit du logo (#030919 → #111f4a) en fond, blanc froid #f3f5ff ; la traînée du M (cyan → violet → magenta → orange → jaune) sert uniquement aux rangs, à la progression et à la sélection (onglet actif, bouquet choisi) ; fond nuit à plat, éclairci derrière le grand titre de l'accueil. Titres Montserrat 800-900 très serrés (−0,035 em), texte Atkinson Hyperlegible, affiches sans cadre, coins de 18 px sur les murs et la fiche, 14 px sur les petites affiches des rangées (proportionnés à leur taille), barre d'onglets flottante en verre sombre.

STORY : en ouvrant l'appli, on voit ce que l'abonnement propose ce soir, on reprend ce qu'on a commencé, on parcourt des collections par genre, et on lance en un appui ; le direct et la recherche sont toujours à un onglet.

FIRST VIEWPORT : en haut, logo Moovo TV à gauche, bouton profil/réglages à droite ; grand titre « Ce soir » (selon l'heure) en Montserrat 900 à 52 px avec une ligne de contexte vraie (ce qu'est le mur) ; mosaïque-podium : le n°1 du Top 10 des films (tendances TMDB, sinon mieux notés) en affiche 2:3 sur deux rangs à gauche, les n°2 et 3 à droite, chaque rang imprimé en chiffre au trait de sa couleur de traînée ; sans rang réel, les trois derniers ajouts sans chiffre ; dessous « Reprendre » avec barres de progression dégradées ; barre d'onglets flottante Accueil / Films / Séries / Direct / Rechercher. L'action principale : toucher une affiche ouvre la fiche, « Lecture » y est en premier.

FORM : Le Mur de collections, n°3 de ma liste ordonnée (tirage surface, structures 5, 4, 3 distribuées ; choisi par l'utilisateur). Mouvement signature : le Top 10 aux numéros géants en contour, dont la couleur parcourt la traînée du M du n°1 (cyan) au n°10 (jaune). seed: none (unavailable) — le tirage de surface n'imprime aucune ligne SEED REFERENCE

FINISH : unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
