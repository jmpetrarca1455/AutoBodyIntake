import fp from 'fastify-plugin';
import underPressure from '@fastify/under-pressure';
import type { FastifyInstance } from 'fastify';

/**
 * Load-shedding: if the event loop is badly backed up or memory usage is
 * critical, fail fast with 503 instead of accepting more work and falling
 * over completely. Cheap insurance for a single-instance deploy (Fly.io
 * `min_machines_running = 0` — one machine can spin up under a burst of
 * traffic with no peers to share load).
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(underPressure, {
    maxEventLoopDelay: 1000, // ms
    maxHeapUsedBytes: 0, // disabled — Fly's 512mb VM makes this too twitchy
    maxRssBytes: 0, // disabled, same reason
    healthCheck: async () => true,
    healthCheckInterval: 5000,
    exposeStatusRoute: '/health/pressure',
  });
});

