# AutoBody Intake — Backend API

Fastify + TypeScript service that receives customer intake submissions and (soon) packages them into an email to the body shop's secretary.

## Requirements
- Node.js >= 18.17
- npm

## Setup
```bash
cd backend
npm install
cp .env.example .env   # fill in values as features are wired up
```

## Run (development)
```bash
npm run dev            # hot-reload via tsx
```
Server starts on `http://localhost:3000`.

## Database (PostgreSQL + Prisma)
```bash
npm run db:up          # start a local Postgres container (Docker)
npx prisma migrate dev # apply migrations
npm run prisma:studio  # (optional) browse data
npm run db:down        # stop & remove the container
```
`DATABASE_URL` in `.env` points Prisma at the database.

## Verify it's alive
```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready      # includes live DB check
curl http://localhost:3000/v1
```

## Shops API (v1)
```bash
# Register a shop (returns a unique intakeLink / token)
curl -X POST http://localhost:3000/v1/shops \
  -H 'Content-Type: application/json' \
  -d '{"name":"Downtown Collision","secretaryEmail":"secretary@shop.com"}'

curl http://localhost:3000/v1/shops                 # list shops
curl http://localhost:3000/v1/shops/:id             # shop detail
  curl http://localhost:3000/v1/intake/:token/shop    # public lookup by intake token
```

## Intake API (v1)
```bash
# Customer submits an intake using the shop's public token (from link/QR).
# Body groups: contact (required), insurance, license, vehicle, rental, claim.
curl -X POST http://localhost:3000/v1/intake/:token \
  -H 'Content-Type: application/json' \
  -d '{"contact":{"fullName":"Jane Driver","phone":"555-9876"}}'

# Shop-owner views (auth-gated in a later phase)
curl "http://localhost:3000/v1/shops/:id/submissions?limit=25"  # cursor-paginated list
curl http://localhost:3000/v1/submissions/:id                   # full payload + attachments
```

The full validated intake payload is stored as JSON on each submission, while
summary fields (customer name, vehicle, claim #, status) are promoted to indexed
columns for fast per-shop listing. Every submission is scoped to one shop.

## File uploads & storage
```bash
# Attach a photo/PDF to a submission (multipart). `kind` categorizes it:
# insurance_card_front|back, license_front|back, vehicle_photo,
# damage_photo, vin_photo, other. Images + PDF only.
curl -X POST "http://localhost:3000/v1/intake/:token/submissions/:submissionId/attachments?kind=damage_photo" \
  -F "file=@./damage.jpg;type=image/jpeg"

# Download an attachment (streams locally, or 302-redirects to a presigned
# URL when S3/R2 is configured).
curl -L http://localhost:3000/v1/attachments/:id --output out.jpg
```

**Storage backend is auto-selected:** if `S3_BUCKET` + access keys are set, files
go to S3/R2; otherwise they land under `UPLOAD_DIR` (default `./uploads`) so dev
works with zero cloud setup. Object keys are tenant-scoped:
`shops/<shopId>/submissions/<submissionId>/<attachmentId>-<file>`.

## Finalize & email delivery
```bash
# After the customer submits and uploads files, finalize packages everything
# into one email (with attachments) and sends it to the shop's secretary.
curl -X POST http://localhost:3000/v1/intake/:token/submissions/:submissionId/finalize
```

**Email backend is auto-selected:** with `RESEND_API_KEY` set, it sends real
email via Resend; otherwise it writes a rendered HTML **preview** to
`UPLOAD_DIR/_email_previews/<submissionId>.html` and logs it — so the whole
flow is testable offline. On success the submission status becomes `EMAILED`
(or `FAILED` if delivery errors).

## End-to-end MVP flow
```
POST /v1/shops                                   → shop + intakeToken
POST /v1/intake/:token                           → submission (RECEIVED)
POST /v1/intake/:token/submissions/:id/attachments?kind=…   → upload photos/docs
POST /v1/intake/:token/submissions/:id/finalize  → email to secretary (EMAILED)
```

## Shop portal auth (JWT)

Each shop signs up **independently** — this is a self-serve product sold
per-shop, not an admin-provisioned one. Signup creates the Shop and its
owner login together.
```bash
curl -X POST http://localhost:3000/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Downtown Collision","secretaryEmail":"front@shop.com","ownerEmail":"owner@shop.com","password":"supersecret123"}'
# → { "token": "...", "shop": { "id", "name", "ownerEmail" } }

curl -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"ownerEmail":"owner@shop.com","password":"supersecret123"}'

curl http://localhost:3000/v1/auth/me -H 'Authorization: Bearer <token>'
```

## Shop dashboard (protected — the portal API)

Everything below requires `Authorization: Bearer <token>` from login/signup.
Every route resolves the shop from the JWT — never a client-supplied id — so
a shop can only ever see its own data.
```bash
curl http://localhost:3000/v1/dashboard/stats                 -H 'Authorization: Bearer <token>'
curl http://localhost:3000/v1/dashboard/submissions            -H 'Authorization: Bearer <token>'
curl http://localhost:3000/v1/dashboard/submissions/:id        -H 'Authorization: Bearer <token>'
curl -X PATCH http://localhost:3000/v1/dashboard/shop \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"phone":"555-0100"}'
```

## AI triage — the "AI employee" layer

Every submission is automatically triaged when it's finalized: a priority
level, a plain-English reason, a list of missing fields, and a suggested
next action for front-desk staff — so nobody has to read the raw form to
know what to do next.
```bash
curl -X POST http://localhost:3000/v1/dashboard/submissions/:id/ai-summary \
  -H 'Authorization: Bearer <token>'
# → { summary, priority, priorityReason, missingInfo[], suggestedNextAction, generatedBy, generatedAt }
```

**AI backend is auto-selected:** with `OPENAI_API_KEY` set, an LLM generates
the summary; otherwise a deterministic **rule-based** engine runs instead
(zero-config, and it's the safety-net fallback even when OpenAI is
configured — if the API call fails, rules kick in so this is never a single
point of failure).

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Hot-reload dev server |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | Type-check without emitting |

## Structure
```
src/
├── server.ts            # bootstrap + graceful shutdown
├── app.ts               # Fastify app builder (plugins + routes)
├── config/              # validated env config (zod)
└── modules/
    ├── health/          # health & readiness endpoints
    ├── shops/           # (next) shop registration + destination email
    ├── intake/          # (next) intake submission
    ├── storage/         # (next) S3/R2 uploads
    └── email/           # (next) Resend packaging & delivery
```

## Docker
```bash
docker build -t autobody-intake-backend .
docker run -p 3000:3000 --env-file .env autobody-intake-backend
```

