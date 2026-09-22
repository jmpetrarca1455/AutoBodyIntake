import { buildApp } from './app.js';
import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';

/**
 * Server bootstrap: builds the app, starts listening, and wires
 * graceful shutdown so in-flight requests drain cleanly on deploy.
 */
async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`🚗 AutoBody Intake API listening on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();

