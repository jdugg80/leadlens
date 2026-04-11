# LeadLens – Setup Guide

Field prospecting app for sales reps. Captures lead info from photos, business cards, and storefronts using AI, then exports directly to your Sales Module Import Template.

---

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- [Expo Go](https://expo.dev/go) app on your Android phone (search "Expo Go" in Play Store)
- A Wi-Fi connection (phone and computer must be on the same network to test)

---

## One-Time Setup

```bash
# 1. Install Expo CLI globally (if you haven't)
npm install -g expo-cli

# 2. Navigate into the project folder
cd LeadLens

# 3. Install dependencies
npm install

# 4. Install the Picker package (required for Status/Property Type dropdowns)
npx expo install @react-native-picker/picker
```

---

## Running the App

```bash
npx expo start
```

A QR code will appear in your terminal. Open **Expo Go** on your phone and scan it. The app loads live — any changes you save in the code reload instantly.

---

## Building for Android (APK)

When you're ready for a real installable APK:

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Configure build (first time only)
eas build:configure

# Build an APK for Android
eas build --platform android --profile preview
```

EAS builds in the cloud — no Android Studio required. You'll get a download link for the `.apk` when it's done. Install it directly on your phone.

---

## Key Files

```
LeadLens/
├── App.js                        # Navigation root
├── app.json                      # Expo config (app name, permissions)
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js        # User profile setup (saves to device)
│   │   ├── DashboardScreen.js    # Queue + quick capture actions
│   │   ├── CaptureScreen.js      # Image picker → Claude API extraction
│   │   ├── ReviewScreen.js       # Edit/confirm fields, save to queue
│   │   └── ExportScreen.js       # Preview queue + export to Excel
│   ├── utils/
│   │   ├── claudeApi.js          # Claude API image extraction
│   │   └── exportXlsx.js        # 23-column Sales Module xlsx export
│   ├── components/
│   │   └── UI.js                 # Shared buttons, inputs, cards
│   └── constants/
│       └── index.js              # Colors, field options, empty lead shape
```

---

## Notes

- **Login persists** – your employee # and branch # are saved on the device. You only enter them once.
- **Leads persist** – the queue survives app restarts until you export and clear.
- **Export** triggers the Android share sheet — save to Files, email it, share to Drive, etc.
- The export file is named `LeadLens_Export_YYYY-MM-DD.xlsx` and matches the exact 23-column Sales Module Import Template column order.
