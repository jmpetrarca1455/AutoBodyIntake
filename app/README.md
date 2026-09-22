# AutoBody Intake — Customer App (Expo)

Cross-platform (iOS · Android · Web) intake app built with **Expo + Expo Router + TypeScript**. A customer opens their shop's link/QR (`/i/<token>`), fills out the guided intake, attaches photos, and submits — the backend packages everything into one email to the shop's secretary.

## Requirements
- Node.js >= 18.17
- The backend running (see `../backend`)

## Setup
```bash
cd app
npm install
```

## Point the app at your API
`app.json → expo.extra.apiBaseUrl` sets the backend URL (default `http://localhost:3000`).
- **Web / iOS simulator:** `http://localhost:3000` works.
- **Physical device:** use your computer's LAN IP, e.g. `http://192.168.1.20:3000`.

## Run
```bash
npm run web       # open in the browser (fastest to test)
npm run ios       # iOS simulator
npm run android   # Android emulator
```
Then open `/i/<intakeToken>` — get a token by registering a shop on the backend
(`POST /v1/shops`).

## Structure
```
app/
├── app/                    # Expo Router routes
│   ├── _layout.tsx         # Stack navigator + theme
│   ├── index.tsx           # Landing / enter shop code
│   └── i/[token].tsx       # Guided intake form (the core screen)
└── src/
    ├── api.ts              # Typed backend client (mirrors backend contracts)
    ├── config.ts           # apiBaseUrl from expo.extra
    ├── theme.ts            # Design tokens
    └── components/         # Field, Section, ChoiceRow, PrimaryButton, PhotoPicker
```

## Submission flow
1. `getShop(token)` → greet the customer with the shop's name (invalid link → friendly error).
2. Fill contact / insurance / license / vehicle / rental / accident sections.
3. Attach photos per category (insurance card, license, damage, etc.).
4. Submit → `createSubmission` → upload each photo → `finalize` (emails the shop) → success screen.

