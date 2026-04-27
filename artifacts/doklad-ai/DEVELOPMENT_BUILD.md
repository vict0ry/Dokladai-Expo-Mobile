# Doklad.ai - Development Build Instructions

## Prerequisites
- Node.js and npm/pnpm installed
- Expo account (create at https://expo.dev)
- EAS CLI installed globally: `npm install -g eas-cli`
- Apple Developer account (for iOS builds)

## Initial Setup (one-time)

### 1. Authenticate with EAS
```bash
eas login
```

### 2. Link project to EAS
```bash
cd artifacts/doklad-ai
eas init
```
This will set the `projectId` in `app.json` automatically.

## Building for iOS (Physical Device)

### 3. Start the iOS build
```bash
cd artifacts/doklad-ai
eas build --profile development --platform ios
```

This produces a build for physical iOS devices (not simulator). EAS will guide you through Apple Developer certificate and provisioning profile setup on first build.

### 4. Install on your iPhone
- After the build completes, EAS provides a download URL and QR code
- Open the link on your iPhone in Safari, or scan the QR code
- You may need to register your device UDID first (EAS will prompt you)
- Install the build — go to Settings > General > VPN & Device Management to trust the developer certificate if prompted

## Building for Android (Physical Device)

### 5. Start the Android build
```bash
cd artifacts/doklad-ai
eas build --profile development --platform android
```

This produces a downloadable `.apk` file for direct installation on any Android device.

### 6. Install on your Android device
- Download the APK directly on your device, or transfer it from your computer
- Enable "Install from unknown sources" in Android settings if prompted

## Running the App

### 7. Start the Metro dev server
```bash
cd artifacts/doklad-ai
npx expo start --dev-client
```

### 8. Connect from the device
- Open the installed Doklad.ai dev client app on your device
- The app will show a screen to enter the dev server URL
- Enter the URL shown in your terminal (or scan the QR code)
- The app will load and connect to the dev server with hot reload

## Notes
- The development build includes `expo-dev-client` which replaces Expo Go
- Unlike Expo Go, dev builds support all native modules (camera, biometrics, notifications, etc.)
- You only need to rebuild when native dependencies change
- JavaScript changes are reflected instantly via hot reload
