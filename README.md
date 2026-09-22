# AutoBody Intake

A vertical software product for auto-body / collision repair shops.

**MVP:** A cross-platform (iOS, Android, web) customer intake app that collects insurance, driver's license, vehicle photos, rental coverage, and claim information — then packages everything into a clean email delivered to the shop's secretary.

## 📄 Start here

👉 **[docs/PROJECT_MASTER_PLAN.md](docs/PROJECT_MASTER_PLAN.md)** — the master project plan and living progress tracker for the entire business venture.

## Status

✅ **MVP feature-complete (backend + app), end-to-end verified.** Remaining: deployment & pilot onboarding. See the master plan's checklist for details.

## Monorepo layout
```
AutoBodyIntake/
├── backend/   ← Fastify + TypeScript API (Postgres/Prisma, storage, email)
├── app/       ← Expo (iOS/Android/web) customer intake app
└── docs/      ← Master plan & docs
```

## Run it locally (full stack)

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
npm run db:up            # local Postgres via Docker
npx prisma migrate dev   # apply migrations
npm run dev              # http://localhost:3000
```
Works with **zero cloud setup**: file uploads fall back to local disk (`./uploads`)
and emails are written as HTML previews (`uploads/_email_previews/`) until you add
S3/R2 and Resend credentials in `.env`.

### 2. App
```bash
cd app
npm install
npm run web              # fastest way to test in a browser
# or: npm run ios / npm run android
```
Set the API URL in `app/app.json → expo.extra.apiBaseUrl` (use your LAN IP on a
physical device).

### 3. Try the flow
```bash
# Register a shop → get an intakeToken
curl -X POST http://localhost:3000/v1/shops \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo Shop","secretaryEmail":"secretary@demo.com"}'
```
Open the app at `/i/<intakeToken>`, fill out the form, attach photos, and submit.
The packaged email is delivered (or previewed) to the shop's secretary.

## MVP data flow
```
POST /v1/shops                                            → shop + intakeToken (link/QR)
GET  /v1/intake/:token/shop                               → greet customer with shop name
POST /v1/intake/:token                                    → submission (RECEIVED)
POST /v1/intake/:token/submissions/:id/attachments?kind=… → upload photos/docs
POST /v1/intake/:token/submissions/:id/finalize           → email to secretary (EMAILED)
```

## Tech stack
Fastify · TypeScript · PostgreSQL/Prisma · S3/R2 storage · Resend email · Expo (React Native) · Docker.

