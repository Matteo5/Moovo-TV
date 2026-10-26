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

## 20 octobre 2026 : iPhone, installation et lecteurs

Appli installée sur iPhone 16 depuis un Mac (Xcode 27, signature « Personal Team », Bundle ID `tv.moovo.app`). Tests sur un faux serveur Xtream local (chaînes HLS et TS, films MP4 / MKV, série, guide).

- **Directs MPEG-TS** : ne pouvaient jamais se lire (mux.js 6 fournit `initSegment`, le code lisait `init`) et, une fois corrigés, laissaient des trous dans le tampon (vidage du transmuxer à chaque morceau réseau, SourceBuffer en mode « sequence ») : image figée sur iPhone. Remplacé par **mpegts.js** (ManagedMediaSource sur iOS 17.1+) ; mux.js retiré.
- **Lecteur VLC des films (iPhone)** : fin de fichier détectée (fermeture et point de reprise) ; nouvelles options (menu ⋯ : vitesse, format d'image mémorisé, décalage audio et sous-titres ; double-tap ±10 s et Ajuster / Remplir ; verrouillage de l'écran ; durée totale ou restante). Les appuis sont lus directement : la rotation forcée en paysage pivotait l'affichage sans pivoter les touchers, les commandes étaient inaccessibles ; le lecteur suit désormais l'orientation de l'iPhone.
- **Interface iPhone** : page de connexion plus large que l'écran (grille des playlists publiques) ; barre d'onglets flottante abaissée juste au-dessus de la barre d'accueil ; accords « 1 série », « Toutes les séries ».
- **Confidentialité** : identifiant et mot de passe masqués dans le journal de chargement du guide.
- **Épisode suivant** : enchaînement automatique en fin d'épisode (saison suivante comprise). Lecteur VLC : carte « Épisode suivant » 20 s avant la fin (Lire / Masquer, compte à rebours) ; lecteur web : carte de 8 s en fin d'épisode.
- **Lecteur VLC plus réactif** : un appui affiche les commandes sans attendre le double-tap ; progression rafraîchie 4 fois par seconde.
- **Paysage sur iPhone** : barre d'onglets compacte et centrée, murs d'affiches et grilles qui tiennent dans la hauteur, marges et lecteur web qui évitent l'encoche (variante Tailwind `phone-landscape`).
- À noter : dans le simulateur iOS, la vidéo VLC reste figée (pas de décodeur VideoToolbox ni d'affichage OpenGL ES) ; tester les films MKV sur un vrai iPhone.

## 20 octobre 2026 (suite) : Android TV / Fire TV

- **Lecteur natif ExoPlayer (Media3 1.9)** sous la WebView transparente, piloté par l'interface existante : HLS, TS en direct, MP4, MKV ; audio AC3 / DTS via le décodeur FFmpeg (Jellyfin). Reconnexion automatique d'un direct coupé, bascule .ts → HLS, repli sur hls.js / mpegts.js si le natif échoue. `FLAG_DETECT_ACCESS_UNITS` écarté : il figeait l'image après quelques images (constaté sur émulateur).
- **Télécommande** : Haut / Bas zappent quand les commandes sont masquées (Fire TV n'a pas de CH+/−) ; OK sur une rubrique du menu entre dans la page.
- **Mises à jour à distance** : `android/update.json` (GitHub) + APK sur Google Drive ; l'application propose l'installation au démarrage (`UpdatePrompt`, `MoovoNative.installUpdate`).
- **APK 1.4 signé** avec une nouvelle clé (`~/Moovo-TV-signature/`, hors dépôt) : désinstaller une fois l'ancienne version 1.3.
- Durées des films lisibles (« 1 h 52 min »).
- Testé sur émulateur Android TV 14 (API 34) : connexion, direct, zapping, film MKV, mise à jour (jusqu'à l'autorisation d'installation).

## 21 octobre 2026 : retours des testeurs (APK 1.5)

- **Tri des films et séries mémorisé** (« Ajoutés récemment »…) d'une ouverture à l'autre, aussi réglable dans Réglages › Lecture (TV et mobile).
- **Guide TV filtrable par bouquet** : pastilles Toutes / Favoris / univers puis bouquets de l'univers, à la place du menu déroulant peu utilisable à la télécommande.
- **Télécommande, onglet Direct** : Droite depuis un bouquet arrivait sur la chaîne alignée à l'écran (pas la première) ; Haut depuis la liste ouvrait l'onglet le plus proche (« Favoris »…) au lieu de l'onglet en cours. Guide : Haut depuis une chaîne pouvait viser une émission cachée sous la colonne.
- **Mises à jour** : l'APK est téléchargé en arrière-plan, la fenêtre n'apparaît qu'une fois prêt et jamais pendant la lecture ; une confirmation d'Android suffit. Données conservées (même clé de signature, vérifiée : SHA-256 `2243ac55…e916`). Essai sur émulateur : 1.4 connectée → 1.5 installée par-dessus, toujours connectée.
- Pour publier : déposer `release/Moovo-TV-1.5.apk` sur Google Drive (partage « Tous les utilisateurs disposant du lien »), puis mettre `versionCode: 6`, `versionName: "1.5"` et le nouveau lien dans `android/update.json` et pousser sur GitHub.

## 26 octobre 2026 : plusieurs playlists et appairage par téléphone (APK 1.6, versionCode 7)

- **Plusieurs playlists** (`src/services/playlistsService.ts`) : chaque source qui se connecte (Xtream, M3U par lien, portail MAG, Enigma2) est gardée avec un nom ; la source d'une 1.5 devient automatiquement la première playlist. Les fichiers M3U importés n'y figurent pas (un seul fichier conservé).
- **Choix au démarrage** (`views/PlaylistPicker.tsx`) dès qu'il y a plusieurs playlists (désactivable), ou si la dernière ouverte est protégée. Réglages › Playlists : ouvrir, renommer, protéger par un code à 4 chiffres, retirer, ajouter.
- **Code par playlist** : réutilise le pavé du contrôle parental (`pendingUnlock` de type `playlist`) ; changer le code d'une autre playlist exige le code actuel. Favoris, bouquets masqués et contrôle parental restent communs.
- **Appairage par QR code** (Android) : l'écran de connexion affiche un QR code ; le téléphone ouvre une page servie par la TV (`PairingServer.java`, port 8765, page `res/raw/pairing.html`), saisit ses accès (Xtream, M3U, MAG) et les envoie avec le code à 4 chiffres affiché. Serveur actif seulement pendant l'affichage, 10 essais de code au maximum, rien ne passe par Internet.
- **Corrigé** : le pavé de code (contrôle parental) effaçait chaque chiffre dès sa saisie ; `setParentalPin` retirait la lettre D au lieu des non-chiffres.
- Vérifié : sélecteur, code de playlist, changement de playlist, migration 1.5 et réglages dans le navigateur ; page du téléphone contre un faux serveur ; APK de débogage 1.6 compilé. **Pas encore testé sur une vraie TV.**
- **Signature** : `android/keystore.properties` de ce PC pointe sur l'ancienne clé (`moovo-release.jks`, SHA-256 `dae8c8c5…1dd4`). La 1.5 est signée avec la nouvelle (`2243ac55…e916`, `~/Moovo-TV-signature/`, absente de ce PC) : construire l'APK 1.6 publié avec la nouvelle clé, sinon il ne s'installera pas par-dessus.
