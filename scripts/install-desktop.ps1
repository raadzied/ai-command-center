# ============================================================
# Install AI Command Center shortcut on the Desktop
# Run once:
#   powershell -ExecutionPolicy Bypass -File scripts\install-desktop.ps1
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8
# files without BOM, which breaks Arabic strings.
# ============================================================

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodeExe = 'E:\node22\node-v22.23.3-win-x64\node.exe'

if (-not (Test-Path $NodeExe)) {
  throw "Node 22 not found at: $NodeExe"
}

if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) {
  Write-Warning '.env not found - the app needs GEMINI_API_KEY and GROQ_API_KEY.'
}

Write-Host ''
Write-Host '> Building Electron app (tsc + vite)...'
& $NodeExe (Join-Path $ProjectRoot 'scripts\build-electron.mjs')
if ($LASTEXITCODE -ne 0) {
  throw "Build failed (exit $LASTEXITCODE)"
}

$ElectronExe = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
$MainJs = Join-Path $ProjectRoot 'dist-electron\electron\main.js'
$RendererHtml = Join-Path $ProjectRoot 'dist-renderer\index.html'

foreach ($required in @($ElectronExe, $MainJs, $RendererHtml)) {
  if (-not (Test-Path $required)) {
    throw "Required file missing: $required"
  }
}

$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'AI Command Center.lnk'

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ElectronExe
$Shortcut.Arguments = "`"$MainJs`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = "$ElectronExe,0"
$Shortcut.Description = 'AI Command Center - personal AI assistant'
$Shortcut.Save()

Write-Host ''
Write-Host "OK - shortcut created: $ShortcutPath"
Write-Host '   Open it from the Desktop to launch the app.'
