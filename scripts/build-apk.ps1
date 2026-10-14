# Compile l'APK Android de Moovo-TV.
# Utilise JAVA_HOME / ANDROID_HOME s'ils existent, sinon les outils portables installés dans
# %LOCALAPPDATA%\Programs\jdk-21* et %LOCALAPPDATA%\Android\Sdk (aucune variable système modifiée).
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1            (APK de débogage)
#   powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1 -Release   (APK signé, voir android/keystore.properties)

param([switch]$Release)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  $jdk = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $jdk) { throw 'JDK 21 introuvable : définissez JAVA_HOME ou installez-le dans %LOCALAPPDATA%\Programs.' }
  $env:JAVA_HOME = $jdk.FullName
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms")) { throw "SDK Android introuvable dans $env:ANDROID_HOME." }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# Indique au projet Gradle où se trouve le SDK
$sdkDir = $env:ANDROID_HOME -replace '\\', '\\'
Set-Content -Path "$root\android\local.properties" -Value "sdk.dir=$sdkDir" -Encoding ascii

Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Échec du build web.' }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'Échec de la synchronisation Capacitor.' }
  Push-Location android
  try {
    $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
    & .\gradlew.bat $task --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Échec de la compilation Gradle ($task)." }
  } finally { Pop-Location }
} finally { Pop-Location }

$apk = Get-ChildItem "$root\android\app\build\outputs\apk" -Recurse -Filter '*.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "APK prêt : $($apk.FullName) ($([math]::Round($apk.Length / 1MB, 1)) Mo)"
