# Deployment Guide

This covers taking AutoBody Intake from local dev to a live, hosted backend +
a deployed web intake page. iOS/Android app store builds are a separate
later step (see the checklist at the end).

---

## 1. Backend API (Fly.io — recommended)

The backend is a Dockerized Fastify app (`backend/Dockerfile`). **It must be
built with the monorepo root as the build context** — it depends on the
`@autobody/shared` npm workspace package, which only resolves via the root
`package-lock.json`. Don't `cd backend && docker build .`; always build from
the repo root with `-f backend/Dockerfile`.

### One-time setup

```bash
# Install the Fly CLI if you don't have it: https://fly.io/docs/flyctl/install/
fly auth login

# From the repo root:
fly launch --no-deploy --dockerfile backend/Dockerfile --name autobody-intake-api
# (fly.toml at the repo root already has the right config — `fly launch`
# will detect and reuse it; say no to overwriting it.)

# Managed Postgres:
fly postgres create --name autobody-intake-db
fly postgres attach autobody-intake-db -a autobody-intake-api
# This injects DATABASE_URL as a Fly secret automatically.

# Everything else the backend needs (see backend/.env.example for the full list):
fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  RESEND_API_KEY="re_..." \
  EMAIL_FROM="AutoBody Intake <intake@yourdomain.com>" \
  S3_ACCESS_KEY_ID="..." \
  S3_SECRET_ACCESS_KEY="..." \
  S3_BUCKET="autobody-intake-uploads" \
  S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
  OPENAI_API_KEY="sk-..." \
  INTAKE_BASE_URL="https://intake.yourdomain.com"
```

**Storage note:** the local-disk storage driver (default when `S3_*` isn't
set) does NOT survive redeploys/restarts on Fly — machines are ephemeral.
Set the `S3_*` secrets (Cloudflare R2 is the cheapest S3-compatible option)
before going live with real customers.

### Deploy

```bash
fly deploy --dockerfile backend/Dockerfile
```

### Run migrations against the deployed DB

```bash
fly ssh console -a autobody-intake-api -C "node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma"
# or, from your machine, using the DB's public URL:
DATABASE_URL="$(fly postgres connection-string -a autobody-intake-db)" \
  npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

### Verify

```bash
curl https://autobody-intake-api.fly.dev/health/ready
```

---

## 2. Backend API (Render — alternative)

If you'd rather use Render instead of Fly:

1. New "Web Service" → connect the GitHub repo.
2. **Root Directory:** leave as the repo root (NOT `backend/`) — Render
   needs the monorepo root as build context, same reasoning as Fly.
3. **Dockerfile Path:** `backend/Dockerfile`.
4. Add a managed Postgres instance (Render → New → PostgreSQL) and copy its
   internal connection string into `DATABASE_URL`.
5. Add the same env vars listed above under "Environment".
6. Health check path: `/health/ready`.

---

## 3. Web intake page (static export)

The customer-facing intake form (`app/`) can be deployed as a static site
separately from the app stores — this is the fastest way to get pilot shops
using the product without any app-store review wait.

```bash
cd app
# Point at the deployed backend before exporting:
EXPO_PUBLIC_API_BASE_URL=https://autobody-intake-api.fly.dev npx expo export --platform web
# Output: app/dist/ — a static site.
```

Deploy `app/dist/` to any static host:

- **Vercel:** `npx vercel deploy app/dist --prod` (or connect the repo with
  Root Directory `app`, Build Command `npx expo export --platform web`,
  Output Directory `dist`).
- **Netlify:** drag-and-drop `app/dist/`, or `netlify deploy --dir=app/dist --prod`.
- **Cloudflare Pages:** `npx wrangler pages deploy app/dist`.

Then update the backend's `INTAKE_BASE_URL` secret to point at wherever this
static site lands (e.g. `https://intake.yourdomain.com`) — that's the domain
used to build each shop's shareable `/i/:token` link.

---

## 4. Mobile app store builds (later phase)

Not needed for the first pilot shops (the web page covers iOS/Android via
mobile Safari/Chrome), but when ready:

```bash
cd app
npx eas build --platform ios
npx eas build --platform android
```

Requires an Expo/EAS account and Apple Developer / Google Play accounts —
see https://docs.expo.dev/build/setup/.

---

## Go-live checklist — turning on real email, SMS, storage & AI

Every external integration in this codebase is built with a **zero-config
dev fallback ⇄ real-provider swap**, driven entirely by env vars/secrets —
no code changes needed to go live. The table below is everything you
personally need to create an account for and paste a real value into (`fly
secrets set ...` in production, `backend/.env` for local dev). Nothing here
can be automated on your behalf — each involves your own billing/identity.

| # | What | Where to get it | Fly secret / env var |
|---|---|---|---|
| 1 | **Real email delivery** | [resend.com](https://resend.com) → add + verify a sending domain (DNS records) → API Keys → create key | `RESEND_API_KEY`, `EMAIL_FROM="Your Shop Name <intake@yourdomain.com>"` (the `EMAIL_FROM` domain **must** match the verified Resend domain) |
| 2 | **Real SMS delivery** | [twilio.com](https://twilio.com) → Console → get Account SID + Auth Token → buy a phone number (SMS-capable) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| 3 | **Inbound SMS webhook** | Twilio Console → Phone Numbers → your number → "A message comes in" → set to `POST https://<api-domain>/v1/webhooks/twilio/sms` | (no env var — configured in Twilio's dashboard) |
| 4 | **Persistent file storage** | Cloudflare R2 (cheapest, S3-compatible) or AWS S3 → create bucket + access key | `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (R2: `https://<account>.r2.cloudflarestorage.com`) |
| 5 | **AI triage/OCR/damage assessment** | [platform.openai.com](https://platform.openai.com) → API keys → create key, **and make sure the account has billing/credits** (a key with `insufficient_quota` silently falls back to the rule-based driver — check `GET /health/ready` → `"ai"` should say `"ok (openai)"`, not `"ok (rules)"`, once configured) | `OPENAI_API_KEY` |
| 6 | **Auth secret** | Generate locally: `openssl rand -hex 32` | `JWT_SECRET` (app refuses to boot in production with the default dev value) |
| 7 | **CORS lockdown** | The exact origin(s) your deployed web intake page / portal are served from | `CORS_ALLOWED_ORIGINS` (comma-separated; without this, prod reflects any origin) |
| 8 | **Intake link domain** | Wherever you deploy the static web export (step 3 above) | `INTAKE_BASE_URL` |
| 9 | **Legal document placeholders** | Your actual company/entity name, a real support inbox, and which state's law governs your ToS | Edit `COMPANY_NAME` / `CONTACT_EMAIL` / `GOVERNING_LAW` at the top of `backend/src/modules/legal/legal.content.ts` — **and get the templates reviewed by a licensed attorney before public launch**, especially if operating outside the US or handling EU/UK customer data (GDPR) |

Apply all of the above to Fly in one shot:
```bash
fly secrets set \
  RESEND_API_KEY="re_..." EMAIL_FROM="Your Shop <intake@yourdomain.com>" \
  TWILIO_ACCOUNT_SID="AC..." TWILIO_AUTH_TOKEN="..." TWILIO_FROM_NUMBER="+1..." \
  S3_BUCKET="..." S3_ACCESS_KEY_ID="..." S3_SECRET_ACCESS_KEY="..." S3_ENDPOINT="..." \
  OPENAI_API_KEY="sk-..." \
  JWT_SECRET="$(openssl rand -hex 32)" \
  CORS_ALLOWED_ORIGINS="https://intake.yourdomain.com,https://portal.yourdomain.com" \
  INTAKE_BASE_URL="https://intake.yourdomain.com" \
  -a autobody-intake-api
```

## Post-deploy checklist

- [ ] `curl https://<api-domain>/health/ready` returns `"status": "ready"`
      with all four checks `ok` — specifically `"email": "ok (resend)"`,
      `"ai": "ok (openai)"` (not `"preview"`/`"rules"`, unless intentional).
- [ ] `S3_*` secrets set (don't run production on local-disk storage — Fly
      machines are ephemeral and uploads will vanish on redeploy/restart).
- [ ] `TWILIO_*` secrets set and the inbound webhook URL configured in the
      Twilio console (item 3 above) — otherwise SMS silently falls back to
      the "preview" driver (logged, never actually sent).
- [ ] `RESEND_API_KEY` set (otherwise emails only go to the local preview
      log, not real inboxes).
- [ ] `JWT_SECRET` set to a real random value (never the `dev-insecure-*`
      default).
- [ ] `INTAKE_BASE_URL` and `CORS_ALLOWED_ORIGINS` point at your real
      deployed domains, not `localhost`.
- [ ] Legal placeholders (`COMPANY_NAME`/`CONTACT_EMAIL`/`GOVERNING_LAW`)
      updated and reviewed by counsel.
- [ ] `npx prisma migrate deploy` run against the production DB.
- [ ] Test signup → login → submit an intake → finalize → send a real SMS
      status update end-to-end against the deployed URLs before onboarding
      a real shop.

