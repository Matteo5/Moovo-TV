#!/usr/bin/env bash
# Génère toutes les déclinaisons du logo Moovo TV à partir du détourage (cutout.rgba) et de l'original.
# Usage : make-assets.sh <dossier logo (source.jpg, cutout.rgba)> <racine du projet>
set -euo pipefail
L="$1"; P="$2"
FF="ffmpeg -v error -y"
NAVY="0x050F2C"      # fond d'origine du logo (icônes, bannière)
INK="0x030919"       # fond de l'application (écran de démarrage)
RAW="-f rawvideo -pix_fmt rgba -s 2528x1696 -i $L/cutout.rgba"

# Cadrages (pixels de l'original 2528x1696) : logo complet, symbole « M », texte « Moovo TV »
PAD=48; X0=$((362-PAD)); Y0=$((671-PAD)); X1=$((2167+PAD)); Y1=$((1037+PAD)); SPLIT=992
FW=$((X1-X0)); FH=$((Y1-Y0)); MW=$((SPLIT-X0)); TW=$((X1-SPLIT))

$FF $RAW -vf "crop=$FW:$FH:$X0:$Y0" -frames:v 1 "$L/cut_full.png"
$FF $RAW -vf "crop=$MW:$FH:$X0:$Y0,pad=$MW:$MW:0:($MW-$FH)/2:color=black@0" -frames:v 1 "$L/cut_mark.png"
$FF $RAW -vf "crop=$TW:$FH:$SPLIT:$Y0" -frames:v 1 "$L/cut_text.png"

# Variante qui contraint aussi la hauteur (logo très large dans un format haut)
place_fit() {
  local in="$1" bg="$2" w="$3" h="$4" share="$5" out="$6"
  $FF -f lavfi -i "color=c=$bg:s=${w}x${h},format=rgba" -i "$in" -filter_complex \
    "[1]scale=w=$w*$share:h=$h*$share:force_original_aspect_ratio=decrease:flags=lanczos[l];[0][l]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgba" \
    -frames:v 1 "$out"
}
circle() { $FF -i "$1" -vf "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-W/2+0.5,Y-H/2+0.5),W/2),alpha(X,Y),0)'" -frames:v 1 "$2"; }

# --- Web (PWA, onglet du navigateur, interface) ---
mkdir -p "$P/public/brand"
$FF -i "$L/cut_full.png" -vf "scale=1000:-1:flags=lanczos" -c:v libwebp -quality 88 "$P/public/brand/moovo-logo.webp"
$FF -i "$L/cut_mark.png" -vf "scale=256:256:flags=lanczos" -c:v libwebp -quality 88 "$P/public/brand/moovo-mark.webp"
$FF -i "$L/cut_text.png" -vf "scale=640:-1:flags=lanczos" -c:v libwebp -quality 88 "$P/public/brand/moovo-wordmark.webp"
place_fit "$L/cut_mark.png" "$NAVY" 512 512 0.86 "$P/public/icon-512.png"
place_fit "$L/cut_mark.png" "$NAVY" 192 192 0.86 "$P/public/icon-192.png"
place_fit "$L/cut_mark.png" "$NAVY" 180 180 0.86 "$P/public/apple-touch-icon.png"
place_fit "$L/cut_mark.png" "$NAVY" 512 512 0.66 "$P/public/icon-maskable-512.png"
$FF -i "$L/cut_mark.png" -vf "scale=64:64:flags=lanczos" -frames:v 1 "$P/public/favicon.png"

# --- Android / Fire TV ---
R="$P/android/app/src/main/res"
for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r dens icon fg <<< "$d"
  place_fit "$L/cut_mark.png" "$NAVY" "$icon" "$icon" 0.86 "$R/mipmap-$dens/ic_launcher.png"
  place_fit "$L/cut_mark.png" "$NAVY" "$icon" "$icon" 0.74 "$L/round_tmp.png"
  circle "$L/round_tmp.png" "$R/mipmap-$dens/ic_launcher_round.png"
  # Icône adaptative : le symbole tient dans la zone sûre (66 dp sur 108)
  place_fit "$L/cut_mark.png" "black@0" "$fg" "$fg" 0.6 "$R/mipmap-$dens/ic_launcher_foreground.png"
done
# Bannière du lanceur Android TV / Fire TV : le logo complet
for d in xhdpi:320:180 xxhdpi:480:270 xxxhdpi:640:360; do
  IFS=: read -r dens w h <<< "$d"
  mkdir -p "$R/drawable-$dens"
  place_fit "$L/cut_full.png" "$NAVY" "$w" "$h" 0.9 "$R/drawable-$dens/banner.png"
done
# Écrans de démarrage : logo complet sur le fond de l'application
for f in "$R"/drawable*/splash.png; do
  read -r w h <<< "$(ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$f" | tr ',' ' ')"
  if [ "$w" -gt "$h" ]; then share=0.5; else share=0.78; fi
  place_fit "$L/cut_full.png" "$INK" "$w" "$h" "$share" "$f"
done
echo "OK"
