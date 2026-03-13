# Sync web assets to Android
npx cap copy android

# Move to android directory
cd android

# Build Debug APK
./gradlew assembleDebug

# Return to root
cd ..

# Copy to versioned filename
cp android/app/build/outputs/apk/debug/app-debug.apk RemindMe_v1.3.23_debug.apk

Write-Host "Debug build complete: RemindMe_v1.3.23_debug.apk"
