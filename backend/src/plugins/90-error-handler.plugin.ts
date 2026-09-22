import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../core/errors.js';

/**
 * Centralized error handling. Any module can `throw new NotFoundError(...)`
 * (see src/core/errors.ts) and get a consistent JSON shape, instead of every
 * route hand-rolling reply.code(...).send(...). Unknown errors are logged and
 * returned as a generic 500 (never leak internals to the client).
 */
export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler((err: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.code,
        message: err.message,
      });
    }

    // Zod / Fastify validation errors already carry a statusCode + message.
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode < 500) {
      return reply.code(statusCode).send({
        statusCode,
        error: err.name ?? 'Bad Request',
        message: err.message,
      });
    }

    request.log.error(err, 'Unhandled error');
    return reply.code(500).send({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  });
});


