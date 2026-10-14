# Installe le SDK Android minimal pour compiler Moovo-TV, sans droits administrateur.
#   powershell -ExecutionPolicy Bypass -File scripts/setup-android-sdk.ps1 -CmdlineToolsZip <commandlinetools-win-*.zip>
#
# Prérequis : JDK 21 (JAVA_HOME, ou dossier %LOCALAPPDATA%\Programs\jdk-21*).
# En lançant ce script, vous acceptez les licences du SDK Android de Google.

param([Parameter(Mandatory = $true)][string]$CmdlineToolsZip)
$ErrorActionPreference = 'Stop'

if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  $jdk = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $jdk) { throw 'JDK 21 introuvable.' }
  $env:JAVA_HOME = $jdk.FullName
}

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$latest = "$sdk\cmdline-tools\latest"
if (-not (Test-Path "$latest\bin\sdkmanager.bat")) {
  $tmp = Join-Path $env:TEMP "moovo-cmdline-$(Get-Random)"
  Expand-Archive -Path $CmdlineToolsZip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
  if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }
  Move-Item "$tmp\cmdline-tools" $latest
  Remove-Item -Recurse -Force $tmp
}

# Les outils récents remplacent sdkmanager par « Android CLI » (android.exe)
$android = "$latest\bin\android.exe"
if (Test-Path $android) {
  & $android --sdk=$sdk --no-metrics sdk install 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
} else {
  $sdkmanager = "$latest\bin\sdkmanager.bat"
  $yes = ('y' + [Environment]::NewLine) * 20
  $yes | & $sdkmanager --sdk_root=$sdk --licenses | Out-Null
  & $sdkmanager --sdk_root=$sdk 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
}
if ($LASTEXITCODE -ne 0) { throw 'Échec de l’installation des paquets du SDK.' }
Write-Host "SDK Android prêt dans $sdk"
