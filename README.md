# Moovo TV

Lecteur IPTV et VOD qui tourne dans le navigateur et s'installe comme une application (PWA), pensé pour trois écrans : **téléviseur Android TV** (télécommande), **ordinateur** (souris, clavier) et **téléphone** (tactile).

Sources prises en charge : playlist **M3U** (lien ou fichier), **Xtream Codes**, portail **MAG / Stalker**, décodeur **Enigma2**. Les accès restent sur l'appareil (localStorage / IndexedDB).

> **Aucun abonnement n'est fourni.** Chacun utilise son propre accès IPTV (Xtream, M3U…). Vos identifiants ne quittent jamais votre PC : ils sont enregistrés dans le navigateur, rien n'est envoyé à un serveur tiers.

---

## 🚀 Tester sur son PC 

### 1. Installer les deux outils nécessaires (une seule fois)

| Outil | Où le trouver | Vérifier qu'il est installé |
|---|---|---|
| **Node.js** 22.12 ou plus récent (prendre la version **LTS**) | https://nodejs.org | `node -v` |
| **Git** | https://git-scm.com/downloads | `git --version` |

Sous Windows, gardez les options par défaut de l'installateur. **Fermez puis rouvrez le terminal** après l'installation pour que les commandes soient reconnues.

### 2. Récupérer le projet et le lancer

Ouvrez un terminal (Windows : touche Windows, tapez `PowerShell` ; Mac : `Terminal`) puis :

```bash
git clone https://github.com/Matteo5/Moovo-TV.git
cd Moovo-TV
npm run dev
```

Au premier lancement, les dépendances s'installent toutes seules (1 à 2 minutes). Quand le terminal affiche `Local: http://localhost:5173/`, ouvrez **http://localhost:5173** dans Chrome, Edge ou Firefox.

> Laissez le terminal ouvert tant que vous utilisez l'application. Pour l'arrêter : `Ctrl + C` dans le terminal.

### 3. Se connecter à son abonnement

Sur l'écran d'accueil, choisissez votre type d'accès et entrez **vos** informations :

- **Xtream Codes** : adresse du serveur (ex. `http://serveur.exemple.com:8080`), nom d'utilisateur, mot de passe ;
- **Playlist M3U** : lien ou fichier `.m3u` ;
- **Portail MAG / Stalker** : adresse du portail + adresse MAC ;
- **Enigma2** : adresse IP du décodeur.

Pas d'abonnement ? Des playlists gratuites et légales (iptv-org) sont proposées pour essayer.

### Mettre à jour vers la dernière version

Dans le dossier `Moovo-TV` :

```bash
git pull
npm install
npm run dev
```

### Bonus : tester depuis la TV ou le téléphone

Le terminal affiche aussi une ligne `Network: http://192.168.x.x:5173/`. Tout appareil connecté **au même Wi-Fi** peut ouvrir cette adresse. Si ça ne répond pas, autorisez Node.js dans le pare-feu Windows (fenêtre qui s'affiche au premier lancement › « Réseaux privés »).

### En cas de problème

| Symptôme | Solution |
|---|---|
| `node` / `npm` / `git` n'est pas reconnu | L'outil n'est pas installé, ou le terminal n'a pas été rouvert après l'installation. |
| « Moovo TV a besoin de Node.js 22.12 ou plus récent » | Installez la version LTS depuis https://nodejs.org. |
| `Port 5173 is in use` | L'application tourne déjà dans un autre terminal ; Vite propose alors 5174, utilisez l'adresse affichée. |
| PowerShell : « l'exécution de scripts est désactivée » | Lancez une fois `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ou utilisez l'Invite de commandes (`cmd`). |
| L'installation échoue au milieu | Supprimez le dossier `node_modules` puis relancez `npm install`. |
| Les chaînes ne se lancent pas | Vérifiez vos identifiants et que votre abonnement est actif (Réglages › état de l'abonnement). |

---

## Commandes pour développer

```bash
npm run dev          # http://localhost:5173 (proxy CORS intégré, installe les dépendances si besoin)
npm run build        # vérification TypeScript + build de production dans dist/
npm run lint         # oxlint
```

## Mettre en production

```bash
npm run build
npm start            # sert dist/ + le proxy sur http://localhost:8080 (PORT et HOST configurables)
```

Le serveur de production (`server/index.ts`) est un simple serveur Node sans dépendance. Il sert l'application et le proxy `/api/proxy`, indispensable car les serveurs IPTV n'envoient pas d'en-têtes CORS.

> ⚠️ Le proxy relaie n'importe quelle URL http(s). Gardez-le sur votre réseau local ou placez-le derrière une authentification avant de l'exposer sur Internet.

Un hébergement purement statique (Netlify, GitHub Pages…) ne suffit pas : sans le proxy, la plupart des fournisseurs IPTV restent injoignables.

## Application Android / Android TV (APK)

L'interface web est embarquée dans une application native avec [Capacitor](https://capacitorjs.com). Il n'y a pas de serveur à héberger : le proxy `/api/proxy` est réimplémenté en Java dans l'application (`android/app/src/main/java/tv/moovo/app/NativeProxy.java`), avec flux continu, Range, réécriture HLS et user-agents IPTV.

```bash
npm run android:apk      # build web + synchro + APK de débogage
```

L'APK est généré dans `android/app/build/outputs/apk/debug/app-debug.apk`. Il faut un JDK 21 (`JAVA_HOME`) et le SDK Android (`ANDROID_HOME`, plateforme 36). `npm run android:open` ouvre le projet dans Android Studio.

**Installer sur Android TV / Google TV / Fire TV**
1. Sur la TV : Paramètres › Système › À propos › cliquer 7 fois sur « Build Android TV » pour activer les options développeur, puis autoriser l'installation d'applications inconnues.
2. Copier l'APK sur une clé USB et l'ouvrir avec un gestionnaire de fichiers, ou l'envoyer avec l'application « Downloader » / « Send Files to TV ».
3. Ou en ligne de commande : `adb connect <ip-de-la-tv>` puis `adb install -r app-debug.apk`.

**Lecteur natif (ExoPlayer / Media3)** : sur Android, la vidéo est décodée par le matériel de la TV (`NativeVideo.java`), sous la WebView devenue transparente ; l'interface du lecteur reste celle de l'application (`src/player/nativeVideo.ts` relaie temps, pause, volume, pistes). HLS, MPEG-TS en direct (reconnexion automatique, bascule .ts → HLS), MP4, MKV, HEVC ; audio AC3 / E-AC3 / DTS par le décodeur FFmpeg. Si un flux ne démarre pas en natif, hls.js / mpegts.js prennent le relais. À la télécommande, commandes masquées : Haut / Bas changent de chaîne, Gauche ouvre la liste, OK affiche les commandes.

**Version publiée et mises à jour** (APK signé, pour Downloader / Google Drive)
1. Clé de signature : `~/Moovo-TV-signature/` (hors dépôt, **à sauvegarder** : sans elle, impossible de publier une mise à jour installable par-dessus). Copier `keystore.properties` dans `android/`.
2. Augmenter `versionCode` / `versionName` dans `android/app/build.gradle`, puis `npm run build && npx cap sync android && cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.
3. Remplacer le fichier sur Google Drive (clic droit › Gérer les versions › Importer une nouvelle version : le lien reste le même), partage « Tous les utilisateurs disposant du lien ».
4. Mettre à jour `android/update.json` (même `versionCode`, `apkUrl` = lien de partage Drive) et pousser sur GitHub : au démarrage suivant, chaque TV propose « Installer » (téléchargement puis installateur d'Android ; la première fois, Android demande d'autoriser Moovo TV à installer des applications).

Spécificités natives : apparition dans le lanceur TV (bannière), mode téléviseur détecté par le système, bouton Retour de la télécommande (calques → accueil → double appui pour quitter), écran maintenu allumé, plein écran sans barres système sur TV.

Limite connue : la WebView Android ne transmet pas le corps des requêtes POST interceptées ; l'envoi de la synchronisation réseau local n'est donc disponible que depuis le navigateur (la récupération au démarrage fonctionne).

**iPhone / iPad** : projet Xcode dans `ios/` (Capacitor, Swift Package Manager). iOS interdit d'intercepter le http de la WebView : l'interface est servie en `capacitor://localhost` et `/api/proxy` est pris en charge par `ios/App/App/NativeProxy.swift` (URLSession : flux continu, Range, réécriture HLS, user-agents IPTV et MAG, POST compris). `MainViewController.swift` greffe ce proxy sur le gestionnaire de schéma de Capacitor. Lecture : hls.js et MPEG-TS via ManagedMediaSource (iOS 17.1+), sinon HLS natif. Le lecteur d'iOS ne lit ni le MKV ni l'AVI (formats courants des films et séries Xtream) : films et épisodes passent donc par un lecteur natif plein écran basé sur VLC (`VLCPlayerViewController.swift`, MobileVLCKit officiel de VideoLAN dans le paquet local `ios/App/VLCKit`), appelé par le plugin `MoovoNative.playVideo` ; il renvoie la position pour la reprise. Réglages de lecture : « Toujours VLC » / « Toujours Infuse » ouvrent plutôt l'appli externe (`vlc-x-callback://`, `infuse://`). Le proxy déduit le type vidéo de l'extension quand le fournisseur envoie `application/octet-stream`.

**Compilation sans Mac (GitHub Actions)** : `.github/workflows/ios.yml` compile l'appli sur un Mac de GitHub à chaque push touchant l'appli (ou à la demande : Actions › iOS › Run workflow) et publie un `.ipa` non signé, artefact `MoovoTV-ipa`. Le télécharger, le dézipper, puis l'installer avec Sideloadly (identifiant Apple de l'utilisateur ; dans les options avancées, garder le même Bundle ID que l'appli déjà installée pour conserver ses données).

Compiler sur un Mac (Xcode 16+, iPhone en iOS 17.1+ conseillé) :
1. Copier le projet (sans `node_modules`), puis `npm install`, `bash scripts/fetch-vlckit.sh` (télécharge MobileVLCKit) et `npm run ios:sync`.
2. `npm run ios:open` (ou ouvrir `ios/App/App.xcodeproj`).
3. Xcode › Réglages › Comptes : ajouter son identifiant Apple. Cible **App** › Signing & Capabilities : cocher « Automatically manage signing », choisir son équipe. Si l'identifiant `tv.moovo.app` est refusé, le remplacer (ex. `tv.moovo.app.<nom>`).
4. Brancher l'iPhone (activer Réglages › Confidentialité et sécurité › Mode développeur), le choisir comme destination, ▶︎.
5. Compte gratuit : l'appli expire au bout de 7 jours. Pour la ré-signer depuis Windows sans Mac : Product › Archive, exporter l'`.ipa` (ou zipper `Payload/App.app`), puis Sideloadly. Compte payant : Archive › TestFlight.

Mettre à jour l'interface sans Mac : `npm run ios:patch-ipa -- -Ipa C:\chemin\MoovoTV.ipa` remplace `App.app/public` dans une copie du `.ipa` (`MoovoTV-maj.ipa`), à installer avec Sideloadly. Valable pour tout ce qui est dans `src/` ; une modification des fichiers Swift exige une recompilation sur Mac.

Mise au point : `MOOVO_DEBUG=1 npm run ios:sync`, puis Safari du Mac › Développement › iPhone.

## Ce que fait l'application

| Domaine | Détail |
|---|---|
| **Direct** | Liste façon décodeur avec numéros de chaîne, catégories, fiche de la chaîne (programme en cours + suivants), saisie du numéro au pavé (0-9), favoris |
| **Lecteur** | Choix automatique de la méthode : HLS → MPEG-TS transmuxé → natif, en direct puis via le proxy. Zapping ↑/↓, tiroir de chaînes, qualités 4K/FHD/HD/SD, bascule sur une chaîne miroir si le flux tombe, multiview 2×2, incrustation (PiP), Cast / AirPlay, commandes sur l'écran verrouillé (Media Session), écran maintenu allumé |
| **Guide TV** | Grille XMLTV virtualisée (heure × chaîne), ligne du direct, 6 jours, replay Xtream sur les émissions passées, guide du fournisseur Xtream en un clic |
| **Films et séries** | Catalogue complet (sans limite), genres, tri, recherche, fiche avec synopsis et casting du panel Xtream (+ TMDB si une clé est saisie), saisons et épisodes, reprise de lecture |
| **Recherche** | Chaînes, émissions en cours, films et séries, insensible aux accents |
| **Réglages** | État de l'abonnement Xtream (expiration, connexions), guide, couleur d'accent, mode d'affichage forcé (TV / ordinateur / mobile), clé TMDB, export / import JSON, synchronisation réseau local |
| **PWA** | Service worker (coquille hors ligne, cache des affiches), icônes Android (dont maskable) |

## Télécommande et clavier

| Touche | Action |
|---|---|
| Flèches | Navigation entre les éléments (focus ambre) |
| 0 – 9 | Aller à une chaîne par son numéro |
| Haut / Bas (lecteur) | Chaîne suivante / précédente |
| Gauche (lecteur) | Tiroir des chaînes · films : −10 s |
| OK / Entrée | Afficher les commandes |
| Retour / Échap | Fermer le lecteur, la fiche ou le tiroir |
| Espace · M · F | Pause · Son · Plein écran |

Le mode TV est détecté automatiquement (Android TV, Fire TV, Tizen, webOS…). On peut aussi le forcer dans les réglages ou avec `?device=tv`.

## Architecture

```text
server/
  proxy.ts            Proxy CORS en streaming (Range, POST, réécriture des playlists HLS)
  index.ts            Serveur de production (dist/ + proxy)
src/
  app/                Coque : rail latéral, onglets mobiles, navigation
  views/              Accueil, Direct, Guide, Films/Séries, Fiche, Favoris, Recherche, Réglages, Connexion
  player/             Moteur de lecture, écran du lecteur, tiroir de chaînes, multiview
  components/         Tuiles, affiches, rangées, liste virtualisée
  ui/                 Design system : marque, boutons, logos, programme, garde-fou d'erreur
  hooks/              Navigation spatiale, bouton Retour, saisie de numéro, mode d'appareil
  services/           M3U, Xtream, Stalker, Enigma2, XMLTV, TMDB, transmuxer TS, sauvegarde
  store/              État global (Zustand)
```

## Design

Univers « régie de télévision » : fond encre bleutée, texte papier chaud, logo Moovo TV (symbole « M » lecture, voir `brand/`) au démarrage, dans le menu et pendant les chargements, mire de barres SMPTE en rappel, numéros de chaîne en chasse fixe façon affichage écran. Typographies auto-hébergées : **Archivo** élargie (titres), **Atkinson Hyperlegible Next** (texte, conçue pour la lisibilité à distance), **Atkinson Hyperlegible Mono** (numéros, horaires). Quatre couleurs d'accent : ambre, cyan, phosphore, magenta.

## Application Windows (.exe à partager)

```bash
npm run desktop:exe      # crée release/desktop/Moovo-TV-<version>-portable.exe (~100 Mo)
npm run desktop          # lance l'application Windows sans créer l'exe
```

Un seul fichier `.exe` portable, sans installation : l'interface et le proxy tournent sur le PC de la personne
(port local 47811), rien ne passe par un serveur tiers. Chacun entre son propre abonnement IPTV.
Comme l'exe n'est pas signé, Windows SmartScreen affiche « Windows a protégé votre ordinateur » au premier
lancement : **Informations complémentaires › Exécuter quand même**. F11 : plein écran.

Si la construction échoue avec `EPERM ... rename win-unpacked` (antivirus sur le Bureau), sortir ailleurs :
`npx electron-builder --win --config.directories.output=%TEMP%\moovo-desktop`.
