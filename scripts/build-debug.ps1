# Build Web Assets
Write-Host "Building Web Assets..." -ForegroundColor Cyan
npm run build

# Sync web assets to Android
Write-Host "Syncing to Android..." -ForegroundColor Cyan
npx cap sync android

# Move to android directory
cd android

# Build Debug APK
./gradlew assembleDebug

# Return to root
cd ..

# Copy to versioned filename
cp android/app/build/outputs/apk/debug/app-debug.apk RemindMe_v1.3.25_debug.apk

Write-Host "Debug build complete: RemindMe_v1.3.25_debug.apk"
