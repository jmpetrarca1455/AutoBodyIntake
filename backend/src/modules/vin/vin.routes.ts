import type { FastifyInstance } from 'fastify';
import { decodeVin } from './vin.service.js';

/**
 * Public VIN decode endpoint — no shop-sensitive data involved (NHTSA's
 * database is public), so no auth needed. Used by both the customer intake
 * form and the staff dashboard's vehicle edit fields. Covered by the
 * global rate limiter like every other route.
 */
export async function vinRoutes(app: FastifyInstance): Promise<void> {
  app.get('/vin-decode/:vin', async (request, reply) => {
    const { vin } = request.params as { vin: string };
    if (!vin || vin.length < 11 || vin.length > 17) {
      return reply.badRequest('VIN must be 11-17 characters');
    }
    return decodeVin(vin);
  });
}

