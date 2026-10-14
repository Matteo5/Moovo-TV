# Récapitulatif Moovo-TV

Historique du travail sur l'application. Le fonctionnement et l'installation sont décrits dans le [README](README.md).

## Avant le 13 octobre 2026 : première version

- Connexion multi-protocoles : M3U, Xtream Codes, MAG / Stalker, Enigma2.
- Lecteur HLS + MPEG-TS (mux.js), regroupement des qualités, multiview, guide XMLTV, catalogue VOD avec TMDB.
- Sauvegarde JSON et synchronisation sur le réseau local.
- Interface sombre inspirée de Netflix.

## 13 octobre 2026 : corrections et refonte complète

### Problèmes corrigés

| Problème | Correction |
|---|---|
| Le proxy n'existait que dans le serveur de dev : une version en ligne ne pouvait joindre aucun serveur IPTV | Proxy partagé (`server/proxy.ts`) + serveur de production Node (`npm start`) |
| Le proxy chargeait toute la réponse en mémoire avant de l'envoyer : les flux `.ts` en direct (sans fin) ne démarraient jamais | Diffusion en streaming, coupure de la requête amont au zapping |
| Playlists HLS proxifiées : segments relatifs cassés | Réécriture des URI des playlists `#EXT-X-*` vers le proxy |
| Synchronisation réseau (POST) et avance rapide (Range) impossibles via le proxy | Méthode, corps et en-tête Range relayés |
| Fournisseur `apptv.co:8080` codé en dur (config, connexion, service Xtream) | Retiré |
| Point de reprise des films jamais enregistré | Sauvegarde toutes les 10 s et à la fermeture, reprise automatique |
| Séries Xtream : URL de lecture fausse, aucun épisode | Saisons et épisodes via `get_series_info` |
| Catalogue films/séries limité à 150 titres, catégories sans nom | Catalogue complet, catégories nommées |
| Guide TV rempli de programmes inventés | Vrais programmes uniquement, écran d'aide si le guide est vide |
| Note TMDB « 7,5 » inventée quand TMDB ne répond pas, clé API de provenance inconnue | Plus de données inventées ; clé TMDB personnelle dans les réglages |
| Changement de qualité sans effet sur les flux TS / HLS | Toutes les URL de la variante sont appliquées |
| Tampon MSE jamais vidé en direct (saturation après une longue session) | Nettoyage du tampon déjà lu |
| Fichier M3U importé perdu au rechargement | Mémorisé dans IndexedDB |
| Pas de service worker, icône SVG seule | Service worker + icônes PNG 192/512 et maskable |
| Un seul fichier JS de 1,36 Mo | Chargement différé : ~126 Ko gzip au démarrage, hls.js chargé à la première lecture |

### Fonctions ajoutées

- Numéros de chaîne et saisie au pavé numérique (télécommande ou clavier).
- Navigation à la télécommande réécrite (par bords, confinée au calque ouvert) et bouton Retour fiable (historique par profondeur).
- Détection TV / ordinateur / mobile avec échelle typographique adaptée, mode forçable.
- Lecteur : choix automatique de la méthode de lecture, OSD de zapping, tiroir de chaînes, barre de progression des films, PiP, Cast / AirPlay, Media Session, maintien de l'écran allumé, garde-fou d'erreur.
- Guide : grille virtualisée sur 6 jours, replay Xtream, guide du fournisseur en un clic, guide court par chaîne (`get_short_epg`).
- Fiches films et séries plein écran (synopsis, casting, durée du panel Xtream), « Ma liste ».
- Recherche globale insensible aux accents ; état de l'abonnement Xtream dans les réglages.

### Refonte de l'interface

Direction « régie de télévision » : mire de barres en signature, numéros façon OSD, focus ambre « lampe d'antenne », typographies auto-hébergées (Archivo, Atkinson Hyperlegible Next et Mono). Toutes les vues ont été réécrites : connexion, accueil avec moniteur « à l'antenne », Direct en trois colonnes, Guide, Films / Séries, Fiche, Favoris, Recherche, Réglages, lecteur et multiview.

### 13 octobre 2026 (suite) : application Android TV et chasse aux bugs

Objectif : installer l'application en APK sur Android TV (puis iOS).

- **Application native Capacitor** (`android/`) : proxy réécrit en Java dans l'application, détection du téléviseur par le système, apparition dans le lanceur TV (bannière, leanback), bouton Retour de la télécommande, écran toujours allumé, icônes et écran de démarrage aux couleurs de Moovo-TV.
- **Bugs corrigés** :
  - le tiroir des chaînes du lecteur ne se fermait pas : ajout d'une croix et de la fermeture en touchant l'image ; la croix du lecteur ferme désormais tout ;
  - le rail de gauche restait bloqué ouvert sur écran tactile (survol « collant ») ;
  - le sélecteur du multiview et le menu Qualité ne se fermaient qu'avec Retour ;
  - sur écran tactile, toucher l'image mettait la vidéo en pause au lieu d'afficher les commandes ;
  - Retour depuis une page quittait l'application au lieu de revenir à l'accueil ;
  - le focus télécommande était perdu à la fermeture du lecteur ou d'une fiche ;
  - zapping hors de la catégorie choisie ; Haut/Bas inopérants quand les commandes étaient visibles ;
  - mode TV : fiche chaîne et moniteur de l'accueil masqués faute de largeur, flou d'arrière-plan trop lourd pour les boîtiers ;
  - portails MAG : lien signé (`create_link`) jamais demandé et flux non identifiés comme décodeur MAG ;
  - confidentialité : les adresses de playlists (souvent avec identifiants) pouvaient partir vers des proxys publics tiers en secours.

### Pistes suivantes

- Authentification facultative du serveur de production avant une exposition sur Internet.
- Pistes audio et sous-titres (hls.js les expose déjà).
- Contrôle parental (code PIN par catégorie).
- Tests automatisés du proxy et du moteur de lecture.

### 13 octobre 2026 (soir) : classement des chaînes et nouvelle marque

- **Direct repensé pour la télécommande** : les 25 bouquets du fournisseur sont rangés automatiquement en univers (France, Sport, Monde, Autres) affichés en onglets ; la colonne de gauche ne montre que les bouquets de l'univers choisi, avec des noms nettoyés (« BOUQUET LIGUE1+ FR » → « Ligue 1+ »). Classement par mots-clés et pays dans `src/services/categoryService.ts`, valable pour d'autres fournisseurs.
- Lignes de chaînes plus compactes sur TV (7 par écran), le bouquet n'est rappelé que si la liste en mélange plusieurs ; préfixes pays retirés des noms (« DE PRO 7 » → « PRO 7 »).
- **Réglages › Bouquets du direct** : masquer les bouquets jamais regardés (pays étrangers…) ; leurs chaînes disparaissent du direct, du guide et du zapping, sans renuméroter les autres.
- **Nouvelle marque Moovo TV** : logo détouré (`brand/`, `public/brand/`) dans le menu, la page de connexion, les chargements, le favicon du site, les icônes Android, la bannière du lanceur Fire TV (logo complet) et l'écran de démarrage. Nom affiché : « Moovo TV ».
- APK 1.2 (versionCode 3) installé sur la Fire Stick.

### À faire ensuite
- Masquer les pseudo-chaînes séparatrices du fournisseur (« Welcome ultimate iptv », « GENERALISTES »).
- **Application Windows** (Electron) : `npm run desktop:exe` produit un `.exe` portable à donner aux testeurs ; le serveur (`server/app.ts`, partagé avec `npm start`) et le proxy tournent en local dans l'application.

## 14 octobre 2026 : charte du logo, tendances, contrôle parental

- **Charte Moovo TV** : nuit bleue du logo en fond, dégradé du « M » (cyan → violet → magenta → orange → jaune) comme signature (anneau de focus des affiches, barres de progression, bouton principal, rangs du Top), titres en Montserrat. Fin du thème « régie » (mire de barres, lignes de balayage, petits titres en capitales). Couleurs d'accent réduites à celles du logo.
- **Accueil** : « À la une » (n°1 des tendances disponible dans l'abonnement), rangées Films / Séries tendance de la semaine (TMDB croisé avec le catalogue, cache 6 h), Reprendre, Vos chaînes, En direct France / Sport. Sans clé TMDB : invitation + « Ajoutés récemment » et « Mieux notés » du fournisseur.
- **Films / Séries** : tris « Tendances » et « Ajoutés récemment », catégories nettoyées.
- **Contrôle parental** (Réglages) : code à 4 chiffres, bouquets verrouillés (adultes pré-cochés), films/séries adultes masqués ; pavé de saisie utilisable à la télécommande ; le zapping saute les chaînes verrouillées.
- **Bugs corrigés** : point de reprise perdu à la fermeture d'un film ; aller-retour infini entre deux flux miroirs en panne ; fausses chaînes séparatrices du fournisseur ; recherche lente sur gros catalogues ; grille d'affiches qui cessait de charger après un filtre ; guide vide si le bouquet choisi était masqué ; touches avalées par le lecteur sous la demande de code.
- **Légèreté** : logos en WebP (≈120 Ko au lieu de 750 Ko), pas de flou lourd sur TV.
- APK 1.3 construit (`release/Moovo-TV-1.3.apk`), **pas encore installé** sur la Fire Stick ; exe Windows 1.3 non reconstruit (à faire plus tard).
