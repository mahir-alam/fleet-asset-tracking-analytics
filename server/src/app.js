import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import assetsRoutes from './modules/assets/assets.routes.js';
import telemetryRoutes from './modules/telemetry/telemetry.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import alertsRoutes from './modules/alerts/alerts.routes.js';
import integrationRoutes from './modules/integration/integration.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigin === '*' ? true : env.clientOrigin.split(',') }));
  app.use(express.json({ limit: '1mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'fleet-api', mode: env.integration.mode }));

  app.use('/api/assets', assetsRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/integration', integrationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
