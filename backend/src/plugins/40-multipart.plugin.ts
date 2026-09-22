import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

/** Multipart/form-data support for file uploads, capped by MAX_UPLOAD_MB. */
export default fp(async (app: FastifyInstance) => {
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
  });
});


