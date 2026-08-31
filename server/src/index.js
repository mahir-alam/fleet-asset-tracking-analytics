import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { startScheduledEvaluation } from './jobs/scheduledEvaluation.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`Fleet API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  logger.info(`Ticketing integration mode: ${env.integration.mode}` + (env.integration.baseUrl ? ` -> ${env.integration.baseUrl}` : ''));
  startScheduledEvaluation();
});

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
