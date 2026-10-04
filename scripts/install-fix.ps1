$ErrorActionPreference = "Stop"
Write-Host "=== Fixing Node 22 environment ===" -ForegroundColor Cyan

# 1) تحقق من Node 22
$env:PATH = "E:\node22\node-v22.23.3-win-x64;" + $env:PATH
$nodeVer = node --version
Write-Host "Node: $nodeVer"
if ($nodeVer -notmatch "^v22") {
    Write-Host "ERROR: Node 22 not active. Check E:\node22 path." -ForegroundColor Red
    exit 1
}

# 2) انتقل للمشروع
Set-Location "E:\ai-command-center"

# 3) احذف كل آثار التثبيت القديم
Write-Host "=== Cleaning old install ===" -ForegroundColor Cyan
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue

# 4) تثبيت نظيف
Write-Host "=== Installing packages ===" -ForegroundColor Cyan
npm install 2>&1 | Tee-Object -FilePath install.log

# 5) تحقق من الحزم الحرجة
Write-Host "=== Verifying critical packages ===" -ForegroundColor Cyan
$checks = @(
    "node_modules\tsx",
    "node_modules\better-sqlite3",
    "node_modules\sqlite-vec",
    "node_modules\sqlite-vec-windows-x64"
)
foreach ($p in $checks) {
    if (Test-Path $p) {
        Write-Host "OK   $p" -ForegroundColor Green
    } else {
        Write-Host "MISS $p" -ForegroundColor Red
    }
}

# 6) إن كل شيء موجود، شغّل اختبار العزل
Write-Host "=== Running sqlite verification ===" -ForegroundColor Cyan
npx tsx scripts/verify-sqlite.ts

Write-Host "=== Done ===" -ForegroundColor Cyan