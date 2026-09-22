# Architecture

How this codebase is organized, and — more importantly — **how it grows**.
The business plan is to expand from one vertical (collision intake) into
many (mechanics, dealerships, towing, glass, fleets), and to go from one
shop to thousands. The structure below is chosen so that growth is
**additive**: new features and verticals are added by creating new files,
not by editing a handful of files that everyone touches (the classic
monolith bottleneck).

## Monorepo layout

```
AutoBodyIntake/
├── package.json          ← npm workspaces root (shared, backend, app)
├── packages/
│   └── shared/            ← @autobody/shared — contracts used by BOTH sides
├── backend/                ← Fastify + TypeScript API
│   └── src/
│       ├── app.ts           ← ~40 lines: autoloads plugins + module registry
│       ├── server.ts         ← process bootstrap, graceful shutdown
│       ├── config/            ← validated env config (zod)
│       ├── core/               ← cross-module primitives (errors, ...)
│       ├── plugins/             ← cross-cutting concerns, AUTOLOADED
│       └── modules/              ← one folder per feature/domain
│           ├── index.ts           ← the module registry (see below)
│           ├── health/
│           ├── shops/
│           ├── intake/
│           ├── storage/
│           └── email/
└── app/                    ← Expo (iOS/Android/web) customer app
    └── src/
        ├── api.ts            ← typed client, imports contracts from shared
        ├── config.ts
        ├── theme.ts
        └── components/
```

## Why a monorepo + a shared package

Before this refactor, the intake/shop field definitions were **duplicated**
in `backend/src/modules/intake/intake.schemas.ts` and hand-copied into
`app/src/api.ts`. Every new field meant editing both, and they *would*
eventually drift.

`packages/shared` is now the single source of truth:
- Zod schemas (validation) live there.
- Both the backend and the app import **the same** TypeScript types inferred
  from those schemas (`z.infer<...>`).
- Add a field once in `packages/shared/src/*.contracts.ts` → both sides are
  typed immediately, and the backend validates it automatically.

**Convention:** as new verticals are added (mechanics, dealerships, ...),
give each its own `<domain>.contracts.ts` file in `packages/shared/src/`
rather than growing one giant file.

## Backend: two extension points, not one big file

### 1. `src/plugins/` — cross-cutting concerns (autoloaded)

Things every request might touch: CORS, multipart parsing, rate limiting,
the JSON body parser, centralized error handling. These are registered via
`@fastify/autoload`, which loads every file in `src/plugins/` automatically.

**To add a new cross-cutting concern** (e.g. request-id tracing, auth
middleware, caching): drop a new file in `src/plugins/`. `app.ts` never
changes. Files are numbered (`10-`, `20-`, `30-`...) so load order is
explicit and predictable — lower numbers register first. Error handling is
`90-` so it registers last, after everything it might need to wrap.

### 2. `src/modules/` — feature domains (registry, not autoload)

Each domain (shops, intake, storage, email, and later: payments, dashboard,
adjuster-tools, other verticals) is a folder with:
- `<name>.routes.ts` — HTTP endpoints (thin — parses input, calls service, formats response)
- `<name>.service.ts` — business logic (talks to Prisma, storage, email)
- `<name>.schemas.ts` — re-exports the relevant contracts from `@autobody/shared`

`src/modules/index.ts` is the **module registry** — an explicit array
mapping each module's route-registrar to a URL prefix:

```ts
export const moduleRegistry = [
  { prefix: '/', register: healthRoutes },
  { prefix: '/v1', register: shopRoutes },
  { prefix: '/v1', register: intakeRoutes },
];
```

**To add a new feature module:** create the folder, write
`export async function xRoutes(app: FastifyInstance)`, add one line to this
array. `app.ts` iterates the registry — it never needs to change again.

We use an explicit registry here (rather than folder-based autoload for
routes) because our routes need deliberate URL structure (versioning,
token-scoped customer routes vs. owner routes) that a folder-to-URL
convention would fight against. Autoload is used where it's a clean fit
(plugins); the registry is used where explicit intent matters (routes).

### 3. `src/core/` — shared backend primitives

Currently: `errors.ts` — typed `AppError` subclasses (`NotFoundError`,
`ValidationError`, `ConflictError`, `UpstreamError`) that any module can
throw. The centralized error-handler plugin catches them and returns a
consistent JSON shape (`{ statusCode, error, message }`) everywhere, instead
of every route hand-rolling `reply.code(...).send(...)`.

As the backend grows, domain-agnostic building blocks (pagination helpers,
auth/tenancy guards, event bus, etc.) belong here.

## Multi-tenancy today, and where it's headed

Every domain row (`Shop`, `Submission`, `Attachment`) is already scoped by
`shopId` — the app is multi-tenant from day one, not bolted on later. As we
add shop-owner accounts/auth, the natural next step is a `tenant` guard
plugin (in `src/plugins/`) that resolves the authenticated shop and makes it
available on `request`, so every module can filter by it without repeating
that logic.

## Storage & email: swappable drivers

`storage.service.ts` and `email.service.ts` each define a small interface
with two implementations (S3/Resend for production, local-disk/HTML-preview
for zero-config local dev), selected automatically from config. This is the
same pattern to reach for with any new external dependency (SMS provider,
OCR service, payment processor): define the interface the rest of the app
depends on, keep the swappable implementation behind it.

## Scaling checklist (what to do as this grows)

| Growth need | Where it goes |
|---|---|
| New field on an existing form | `packages/shared/src/intake.contracts.ts` |
| New vertical (mechanics, towing, ...) | New `packages/shared/src/<vertical>.contracts.ts` + new `backend/src/modules/<vertical>/` + one line in the module registry |
| New cross-cutting concern (auth, tracing, caching) | New file in `backend/src/plugins/` |
| New external integration (SMS, OCR, payments) | New service in its module with a small swappable-driver interface |
| Heavier read load on submissions | Add indexes in `prisma/schema.prisma`; the cursor-paginated list query is already index-friendly (`@@index([shopId, createdAt])`) |
| Need background jobs (e.g. async email retries) | Add a `src/jobs/` folder + a queue plugin in `src/plugins/`; modules enqueue, jobs consume |
| Public API abuse | Already rate-limited globally (`50-rate-limit.plugin.ts`); tighten per-route with `config: { rateLimit: {...} }` on specific routes if needed |

