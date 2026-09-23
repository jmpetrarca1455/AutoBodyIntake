# 🧪 Local Pilot Testing Guide

This is the exact, verified path to run the **entire product locally** and test it
like a real body shop and a real customer would — no cloud accounts required.

> ✅ Verified end-to-end on Sept 22, 2026: shop signup → intake link → customer
> submission (with photo + OCR) → email delivery → dashboard → AI triage →
> staff invite/login. See `docs/PROJECT_MASTER_PLAN.md` §8 for the checklist.

---

## 1. One-time setup

```bash
cd /Users/johnmax/Desktop/AutoBodyIntake

# Install everything (root + backend + app, npm workspaces)
npm install
npm run build:shared   # compiles @autobody/shared — re-run after editing contracts

cd backend
cp .env.example .env   # only if you don't already have one
```

`backend/.env` defaults work with **zero cloud setup**:
- Files → saved to `backend/uploads/` (local disk)
- Email → written as an HTML preview to `backend/uploads/_email_previews/` (never actually sent)
- AI triage → deterministic rule-based engine (no OpenAI key needed)

If you want **real behavior** instead of previews, fill in `backend/.env`:
| Feature | Env var(s) | Get it from |
|---|---|---|
| Real email delivery | `RESEND_API_KEY`, `EMAIL_FROM` | resend.com (needs a verified sending domain) |
| Cloud file storage | `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Cloudflare R2 / AWS S3 |
| LLM-powered AI triage/OCR | `OPENAI_API_KEY` | platform.openai.com — **must have billing credits**, not just a valid key (see Known Issues below) |

## 2. Start the database

```bash
cd backend
npm run db:up                 # starts a local Postgres container (one-time; if it already exists, `docker start autobody-postgres`)
npx prisma migrate deploy     # apply all migrations (or `migrate reset --force` for a clean slate)
```

## 3. Start the backend

```bash
cd backend
npm run dev                   # http://localhost:3000
```

Verify it's healthy:
```bash
curl http://localhost:3000/health/ready
# {"status":"ready","checks":{"database":"ok","storage":"ok (local)","email":"ok (preview)","ai":"ok (rules)"}}
```

## 4. Start the customer/shop app (web — fastest to test)

```bash
cd app
npm run web                   # http://localhost:8081
```

- **On your laptop's browser:** just open `http://localhost:8081`.
- **On your phone (same WiFi):** find your Mac's LAN IP (`ipconfig getifaddr en0`)
  and set `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:3000` before `npm run web`,
  or edit `app/app.json → expo.extra.apiBaseUrl`. Then open `http://<your-lan-ip>:8081`
  on the phone's browser.
- **Native (iOS/Android simulator or Expo Go):** `npm run ios` / `npm run android`.

## 5. Walk through the flow as a real shop owner

1. Open `http://localhost:8081` → **"Go to shop portal →"** → **Sign up**.
   Enter the shop's real name, a secretary/front-desk email, an owner login
   email, and a password (8+ chars).
2. You're dropped into the **dashboard** — empty, since no submissions yet.
3. Tap **"Intake link & settings"** in the dashboard header — this screen
   shows the shareable **intake link**, a **QR code** (scan to open it on a
   phone), a one-tap **copy link** button, and editable shop details
   (name/address/phone/secretary email).
4. (Owner-only) **Invite staff**: from the dashboard header → "Manage staff" →
   enter a staff email + temp password. They log in at `/portal/login` with
   those credentials and see the same inbox, minus shop settings/staff management.

## 6. Walk through the flow as a real customer

1. Open the shop's **intake link** (`/i/<token>`) — this is exactly what a
   customer gets via text/QR after an accident. No login required.
2. Fill in contact info, insurance, license, vehicle, rental, and claim
   sections. Attach photos (license front/back, insurance card, damage
   photos) — the picker supports camera or photo library.
3. Tap **Submit to shop**. Behind the scenes: creates the submission →
   uploads each photo → runs OCR on license/insurance/VIN photos (auto-fills
   fields) → finalizes → emails (or previews) the shop.
4. You'll see a confirmation screen. That's the whole customer experience —
   by design, no login, no app install, just a link.

## 7. Confirm the shop received it

- **Dashboard:** back in `/portal`, the submission appears with an AI
  priority badge (urgent/high/medium/low) computed automatically.
- **Email preview (if `RESEND_API_KEY` isn't set):**
  ```bash
  open backend/uploads/_email_previews/<submissionId>.html
  ```
- **Real email (if `RESEND_API_KEY` is set):** check the secretary inbox.
- Tap into the submission for the full AI triage (summary, missing info,
  suggested next action) and every field/attachment the customer sent.

## 8. Reset between test runs

```bash
cd backend
npx prisma migrate reset --force   # wipes all shops/submissions, reapplies migrations
rm -rf uploads/_email_previews/* uploads/shops/*   # clears local files
```

---

## Known issues / things to fix before a real pilot goes live

1. **OpenAI billing:** a real `OPENAI_API_KEY` is configured, but the account
   has **no billing credits** (`insufficient_quota` from OpenAI's API) — the
   app correctly and silently falls back to the rule-based triage engine, so
   nothing breaks, but you're not yet seeing LLM-quality triage/OCR. Add
   credits at platform.openai.com/settings/organization/billing to compare.
2. **CORS is wide open** (`origin: true` in `backend/src/plugins/20-cors.plugin.ts`)
   — fine for local testing, but lock it to your real app/web origins before
   a public pilot.
3. **Emailing PII as attachments** (license/insurance photos) is simple but
   less secure than a portal link — acceptable for a pilot, revisit per the
   master plan's legal/compliance section before wider launch.
4. **npm workspaces + Expo Router hoisting gotcha (fixed, but know about it):**
   if you ever wipe `node_modules` and reinstall, npm workspace hoisting can
   place `expo-router` only at the repo root instead of duplicating it into
   `app/node_modules`. Expo's web dev server computes its entry-bundle URL as
   a literal file path relative to `app/`, so it 404s in that case (blank web
   app, `Unable to resolve module ./node_modules/expo-router/entry`). Fixed
   permanently by `app/scripts/ensure-local-expo-router.js`, wired as
   `app`'s `postinstall` script — it symlinks `app/node_modules/expo-router`
   to the hoisted copy automatically. If you ever run `npm install
   --ignore-scripts` (e.g. to route around an unrelated native build
   failure like `fsevents`), re-run it manually:
   ```bash
   node app/scripts/ensure-local-expo-router.js
   ```
5. **A stray `react-native@latest` at the repo root (fixed):** npm's
   automatic peer-dependency installation (default since npm v7) was
   installing an unrelated, unpinned "latest" `react-native`/`react`/`metro`
   at the workspace root — completely different from the app's pinned
   Expo SDK 51 versions — which then won Node's module resolution race and
   broke Metro. Fixed by committing `.npmrc` with `legacy-peer-deps=true`
   at the repo root. If `expo start --web` ever throws a Metro/`@expo/cli`
   version-mismatch error like `Package subpath './src/lib/TerminalReporter'
   is not defined by "exports"`, this is the culprit — do a full clean
   reinstall (`rm -rf node_modules app/node_modules backend/node_modules
   packages/shared/node_modules package-lock.json && npm install`) and
   confirm `node_modules/react-native/package.json` matches `app/package.json`'s
   pinned version (`0.74.5`), not something newer.



