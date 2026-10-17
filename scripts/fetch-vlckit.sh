#!/usr/bin/env bash
# Télécharge MobileVLCKit (VideoLAN, officiel) dans ios/App/VLCKit/ pour la compilation iOS.
# Même archive que le podspec CocoaPods MobileVLCKit 3.7.4. À lancer sur Mac (ou en CI) avant Xcode.
set -euo pipefail
URL="https://download.videolan.org/pub/cocoapods/prod/MobileVLCKit-3.0-20260922-1512.tar.xz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/ios/App/VLCKit/MobileVLCKit.xcframework"

if [ -d "$DEST" ]; then
  echo "MobileVLCKit déjà présent : $DEST"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Téléchargement de MobileVLCKit…"
curl -fL --retry 3 -o "$TMP/vlckit.tar.xz" "$URL"
shasum -a 256 "$TMP/vlckit.tar.xz"
tar -xJf "$TMP/vlckit.tar.xz" -C "$TMP"
FOUND="$(find "$TMP" -maxdepth 4 -type d -name MobileVLCKit.xcframework | head -1)"
if [ -z "$FOUND" ]; then
  echo "MobileVLCKit.xcframework introuvable dans l'archive" >&2
  exit 1
fi
mv "$FOUND" "$DEST"
echo "MobileVLCKit installé : $DEST"
