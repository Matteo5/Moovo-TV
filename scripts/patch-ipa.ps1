# Met à jour l'interface d'un .ipa Moovo TV depuis Windows, sans Mac.
# L'interface web est rangée telle quelle dans App.app/public : on la remplace par la version du projet,
# puis Sideloadly re-signe l'ensemble à l'installation. Ne couvre PAS les changements du code Swift (ios/App/App/*.swift),
# qui exigent une compilation sur Mac.
#
#   powershell -ExecutionPolicy Bypass -File scripts/patch-ipa.ps1 -Ipa C:\chemin\MoovoTV.ipa
#   → crée MoovoTV-maj.ipa à côté du fichier d'origine (l'original n'est pas modifié)

param([Parameter(Mandatory = $true)][string]$Ipa)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$Ipa = (Resolve-Path $Ipa).Path
$out = Join-Path (Split-Path -Parent $Ipa) (([IO.Path]::GetFileNameWithoutExtension($Ipa)) + '-maj.ipa')

Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Échec du build web.' }
  # Copie dist/ dans ios/App/App/public avec les fichiers propres à Capacitor (cordova.js…)
  npx cap copy ios
  if ($LASTEXITCODE -ne 0) { throw 'Échec de la copie Capacitor.' }
} finally {
  Pop-Location
}

$public = Join-Path $root 'ios\App\App\public'
Copy-Item $Ipa $out -Force

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
# Mode mise à jour : les autres entrées (binaire, signature, ressources) gardent leurs attributs Unix
$zip = [IO.Compression.ZipFile]::Open($out, [IO.Compression.ZipArchiveMode]::Update)
try {
  $first = $zip.Entries | Where-Object { $_.FullName -match '^Payload/[^/]+\.app/public/' } | Select-Object -First 1
  if (-not $first) { throw "Dossier Payload/*.app/public introuvable dans $Ipa : est-ce bien un .ipa Moovo TV ?" }
  $prefix = ($first.FullName -replace '^(Payload/[^/]+\.app/public/).*$', '$1')

  $old = @($zip.Entries | Where-Object { $_.FullName.StartsWith($prefix) })
  foreach ($entry in $old) { $entry.Delete() }

  $files = Get-ChildItem $public -Recurse -File
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($public.Length + 1) -replace '\\', '/'
    $entry = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $prefix + $relative)
    # Fichier ordinaire rw-r--r-- (format Unix attendu par iOS)
    $entry.ExternalAttributes = -2119958528 # 0o100644 << 16, en entier signé 32 bits
  }
  Write-Host "Interface remplacée : $($old.Count) fichiers retirés, $($files.Count) ajoutés."
} finally {
  $zip.Dispose()
}

Write-Host "Prêt : $out"
Write-Host 'Installe-le avec Sideloadly (même identifiant Apple et même Bundle ID que l''appli déjà sur l''iPhone).'
