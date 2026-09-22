# AutoBody Intake — backend image.
#
# IMPORTANT: this must be built with the MONOREPO ROOT as the build context,
# not backend/ — the backend depends on the @autobody/shared workspace
# package ("@autobody/shared": "*" in backend/package.json), which only
# resolves via the root package-lock.json's npm workspaces. Building from
# backend/ alone has no visibility into packages/shared and will fail.
#
#   docker build -f backend/Dockerfile -t autobody-backend .
#   docker run --env-file backend/.env -p 3000:3000 autobody-backend
#
# (See fly.toml / docs/DEPLOYMENT.md for the hosted deploy path.)

# ── Build stage ────────────────────────────────────────
# Debian-based "slim" image (not alpine/musl) — Prisma's native query engine
# binaries are built against glibc + OpenSSL, and musl compatibility is
# fragile (missing libssl.so.1.1 on newer Alpine, wrong binaryTarget, etc).
# Slim avoids that whole class of "engine failed to load" runtime errors.
FROM node:20-bookworm-slim AS build
WORKDIR /repo

# Prisma's native query engine needs OpenSSL present at generate-time (to
# detect the right binary target) and at runtime (to actually load it).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install once at the root so workspace deps (@autobody/shared) resolve.
# Copying just the manifests first keeps this layer cacheable.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY backend/package.json backend/package.json
RUN npm ci

# Build the shared contracts package first — the backend imports its
# compiled output (packages/shared/dist), not its TypeScript source.
COPY packages/shared ./packages/shared
RUN npm run build --workspace=@autobody/shared

# Build the backend.
COPY backend/prisma ./backend/prisma
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
# Use `npm run --workspace` (not bare `npx`) — prisma's bin can end up
# nested under backend/node_modules/.bin rather than hoisted to the root,
# depending on how the lockfile resolved it, and only the workspace-scoped
# npm run reliably finds it either way.
RUN npm run prisma:generate --workspace=backend
RUN npm run build --workspace=backend

# ── Runtime stage ──────────────────────────────────────
# Reuses the build stage's node_modules (already prod+dev deps, hoisted at
# the workspace root) rather than re-resolving a partial install — simpler
# and more reliable for a workspace this size than pruning per-workspace.
FROM node:20-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV HOST=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/backend/package.json ./backend/package.json
COPY --from=build /repo/backend/dist ./backend/dist
COPY --from=build /repo/backend/prisma ./backend/prisma
# A handful of deps (prisma, fastify, ...) resolved into backend/node_modules
# rather than hoisting to the root, depending on the lockfile — copy it too
# so Node's module resolution (which walks up from backend/dist) finds them.
COPY --from=build /repo/backend/node_modules ./backend/node_modules

WORKDIR /repo/backend
EXPOSE 3000
CMD ["node", "dist/server.js"]

