# Play Store Release Build Script
# Usage: ./scripts/build-release.ps1

Write-Host "Starting Play Store Release Build..." -ForegroundColor Cyan

# 1. Sync Web Assets
Write-Host "Syncing Web Assets to Android..." -ForegroundColor Yellow
cmd /c "npx cap sync android"
if ($LASTEXITCODE -ne 0) { Write-Error "Sync failed!"; exit 1 }

# 2. Build Signed Bundle
Write-Host "Building Signed AAB (Release)..." -ForegroundColor Yellow
Set-Location android
cmd /c "gradlew bundleRelease"
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed!"; exit 1 }
Set-Location ..

# 3. Success Message
$aabPath = "android/app/build/outputs/bundle/release/app-release.aab"
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "Upload this file to Play Console:" -ForegroundColor Cyan
Write-Host $aabPath -ForegroundColor White
