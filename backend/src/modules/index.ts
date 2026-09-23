import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health/health.routes.js';
import { shopRoutes } from './shops/shop.routes.js';
import { intakeRoutes } from './intake/intake.routes.js';
import { authRoutes } from './auth/auth.routes.js';
import { dashboardRoutes } from './dashboard/dashboard.routes.js';
import { communicationsRoutes } from './communications/communications.routes.js';
import { webhooksRoutes } from './webhooks/webhooks.routes.js';

/**
 * Module registry — the ONE place a new feature module gets wired in.
 *
 * To add a module (payments, dashboard, adjuster-tools, a new vertical…):
 *   1. Create src/modules/<name>/<name>.routes.ts exporting an
 *      `export async function xRoutes(app: FastifyInstance)`.
 *   2. Add one line below with its prefix.
 * `app.ts` never needs to change again — it just iterates this list.
 *
 * `prefix: '/'` mounts at the API root (e.g. health checks, outside
 * versioning); everything else nests under the versioned `/v1` namespace.
 */
export const moduleRegistry: Array<{
  prefix: string;
  register: (app: FastifyInstance) => Promise<void>;
}> = [
  { prefix: '/', register: healthRoutes },
  { prefix: '/v1', register: shopRoutes },
  { prefix: '/v1', register: intakeRoutes },
  { prefix: '/v1', register: authRoutes },
  { prefix: '/v1', register: dashboardRoutes },
  { prefix: '/v1', register: communicationsRoutes },
  { prefix: '/v1', register: webhooksRoutes },
];







