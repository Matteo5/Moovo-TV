# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Une seule interface React livrée en trois emballages : APK Android TV / Fire TV (Capacitor), application Windows (Electron) et site / PWA. Le téléviseur à la télécommande est l'écran de référence ; ordinateur (souris, clavier) et téléphone (tactile) suivent.

## Users

- Aujourd'hui : le créateur et ses proches, sur Fire TV Stick et PC, chacun avec son propre abonnement IPTV.
- À terme : un public plus large (diffusion envisagée hors du cercle d'amis). La première prise en main et les textes d'aide doivent donc tenir seuls, sans explication orale.
- Situation type : canapé, télécommande en main, à 3 m de l'écran ; zapper, retrouver une chaîne, lancer un film ou reprendre une série.

## Product Purpose

Moovo TV lit l'abonnement IPTV de l'utilisateur (Xtream Codes, M3U, portail MAG/Stalker, Enigma2) : chaînes en direct avec guide TV et replay, films et séries avec reprise, recherche, favoris. Réussite : plus fluide et plus clair que les lecteurs IPTV existants, utilisable entièrement à la télécommande.

## Positioning

Lecteur pensé télécommande d'abord, qui range un catalogue brut de fournisseur (dizaines de bouquets, milliers de chaînes) en univers lisibles, et qui croise le catalogue de l'utilisateur avec les tendances TMDB pour n'afficher que ce qu'il peut vraiment regarder.

## Operating Context

- Matériel modeste : Fire TV Stick (WebView Android, GPU faible) ; légèreté et fluidité priment sur les effets.
- Aucun compte en ligne : identifiants, favoris et réglages restent sur l'appareil. Le proxy IPTV tourne dans l'application (Java sur Android, Node dans l'exe Windows et le serveur `npm start`).
- Catalogues réels : environ 2 000 chaînes et 25 bouquets chez le fournisseur du créateur.

## Capabilities and Constraints

- Toutes les options déjà livrées doivent fonctionner : pistes audio et sous-titres, tampon, langue préférée, lecteur externe (VLC, MX, Nova, Just Player), reprise films/séries, Ma liste, favoris, masquage de bouquets, guide XMLTV et replay, multiview, Chromecast sur PC, sauvegarde JSON.
- Tendances : TMDB (clé gratuite saisie par l'utilisateur) croisé avec le catalogue ; sans clé, repli sur les informations du fournisseur (ajouts récents, notes).
- Ne jamais inventer de données (notes, programmes, affiches) quand une source ne répond pas.
- Pas d'hébergement public du proxy sans authentification.

## Brand Commitments

- Nom : « Moovo TV ». Logo fourni par le créateur (`brand/moovo-logo-source.jpg`) : à utiliser tel quel, jamais redessiné ni modifié, seulement détouré et cadré.
- L'application et le site doivent correspondre au logo et à sa direction artistique (demande explicite du créateur).
- Interface en français.

## Evidence on Hand

- Logo source et déclinaisons : `brand/`, `public/brand/`, ressources Android.
- Aucun témoignage, chiffre d'audience ou avis utilisateur : ne pas en fabriquer.

## Product Principles

1. La télécommande d'abord : tout est atteignable aux flèches, le focus est toujours visible, Retour fait toujours ce qu'on attend.
2. Léger et fluide sur un boîtier à petit processeur avant d'être spectaculaire.
3. Ranger le catalogue brut du fournisseur pour qu'on trouve en trois appuis.
4. Montrer des données vraies ou rien.
5. Les données de l'utilisateur ne quittent pas son appareil.

## Accessibility & Inclusion

Lecture à 3 m : grandes tailles de texte en mode TV, contrastes forts, aucune information portée par la seule couleur, animations réduites si le système le demande.
