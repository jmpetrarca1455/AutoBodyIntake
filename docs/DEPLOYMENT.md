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

## Post-deploy checklist

- [ ] `curl https://<api-domain>/health/ready` returns `"status": "ready"`
      with all four checks `ok`.
- [ ] `S3_*` secrets set (don't run production on local-disk storage).
- [ ] `RESEND_API_KEY` set (otherwise emails only go to the local preview
      log, not real inboxes).
- [ ] `JWT_SECRET` set to a real random value (never the `dev-insecure-*`
      default).
- [ ] `INTAKE_BASE_URL` points at the deployed web intake page, not
      `localhost`.
- [ ] `npx prisma migrate deploy` run against the production DB.
- [ ] Test signup → login → submit an intake → finalize end-to-end against
      the deployed URLs before onboarding a real shop.

