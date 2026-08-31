import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { runFleetEvaluation } from '../modules/alerts/alerts.service.js';

/**
 * Optional in-process scheduler. Disabled unless EVALUATION_CRON is set.
 * The PowerShell pipeline hits POST /api/alerts/evaluate for the same effect.
 */
export function startScheduledEvaluation() {
  const expr = env.evaluationCron;
  if (!expr) {
    logger.info('EVALUATION_CRON not set — in-process scheduler disabled');
    return null;
  }
  if (!cron.validate(expr)) {
    logger.warn(`EVALUATION_CRON "${expr}" is not a valid cron expression — scheduler disabled`);
    return null;
  }

  const task = cron.schedule(expr, () => {
    logger.info('Scheduled fleet evaluation starting');
    runFleetEvaluation().catch((err) => logger.error(`Scheduled evaluation failed: ${err.message}`));
  });
  logger.info(`Scheduled fleet evaluation registered: "${expr}"`);
  return task;
}
