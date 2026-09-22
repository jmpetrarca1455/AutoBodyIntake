/**
 * Ambient type augmentation for @fastify/jwt.
 *
 * Why this file exists: in this npm workspace, `backend/node_modules/fastify`
 * and the workspace-root `fastify` can end up as two separate physical
 * packages (different semver ranges pulled by different deps). TypeScript
 * treats those as two distinct module identities, so @fastify/jwt's own
 * `declare module 'fastify'` augmentation (which targets whichever copy IT
 * resolves) doesn't always merge into the copy used elsewhere in our source.
 * Restating the shape we actually use here, against our own local 'fastify'
 * import, makes the types reliable regardless of hoisting.
 */
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    jwt: {
      sign(payload: Record<string, unknown>, options?: Record<string, unknown>): string;
      verify<T = unknown>(token: string, options?: Record<string, unknown>): T;
    };
  }

  interface FastifyRequest {
    jwtVerify<T = unknown>(options?: Record<string, unknown>): Promise<T>;
  }
}

