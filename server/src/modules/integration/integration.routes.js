import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, notFound } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { env } from '../../config/env.js';
import { createTicketFromFlag } from './ticketClient.js';

const router = Router();

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({
      mode: env.integration.mode,
      configured: Boolean(env.integration.baseUrl),
      endpoint: env.integration.baseUrl
        ? `${env.integration.baseUrl}${env.integration.endpointPath}`
        : null,
      externalSource: env.integration.externalSource,
    });
  }),
);

router.get(
  '/events',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.integrationEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: req.query.limit,
      }),
    );
  }),
);

/**
 * "Send test alert" control on the dashboard. Builds a throwaway flag for a
 * chosen asset and runs it through the payload builder so you can see the shape
 * of an auto-create call and confirm the audit trail works.
 *
 * This is always a simulation: it forces mock mode, so it never posts to a real
 * ticketing system regardless of INTEGRATION_MODE. The flag is not persisted;
 * the IntegrationEvent is, marked with direction "test" so it is
 * distinguishable from real evaluation traffic in the log.
 */
router.post(
  '/test-alert',
  validate({
    body: z
      .object({
        assetId: z.string().optional(),
        kind: z
          .enum(['SERVICE_OVERDUE', 'EXCESSIVE_DOWNTIME', 'HIGH_FUEL_BURN'])
          .default('EXCESSIVE_DOWNTIME'),
      })
      .partial(),
  }),
  asyncHandler(async (req, res) => {
    const asset = req.body.assetId
      ? await prisma.asset.findUnique({ where: { id: req.body.assetId } })
      : await prisma.asset.findFirst({ orderBy: { assetTag: 'asc' } });
    if (!asset) throw notFound(req.body.assetId ? 'Asset not found' : 'No assets exist — seed the database first');

    const kind = req.body.kind ?? 'EXCESSIVE_DOWNTIME';
    const syntheticFlag = {
      id: `test-alert-${Date.now()}`,
      kind,
      detail: 'Simulated alert from the dashboard "Send test alert" control — not a real maintenance finding.',
      thresholdValue: 0,
      observedValue: 0,
    };

    const outcome = await createTicketFromFlag({
      flag: syntheticFlag,
      asset,
      externalRef: `test-alert:${asset.assetTag}:${Date.now()}`,
      mode: 'mock',
    });

    await prisma.integrationEvent.create({
      data: {
        maintenanceFlagId: null,
        direction: 'test',
        endpoint: outcome.endpoint,
        requestPayload: outcome.requestPayload,
        responseStatus: outcome.status ?? null,
        responseBody: outcome.raw ?? null,
        ticketNumber: outcome.ticketNumber ?? null,
        ok: outcome.ok,
        errorMessage: outcome.error ?? null,
      },
    });

    res.status(outcome.ok ? 201 : 502).json({
      ok: outcome.ok,
      simulated: true,
      asset: { id: asset.id, assetTag: asset.assetTag },
      kind,
      ticketNumber: outcome.ticketNumber ?? null,
      endpoint: outcome.endpoint,
      requestPayload: outcome.requestPayload,
      responseBody: outcome.raw ?? null,
      error: outcome.error ?? null,
    });
  }),
);

export default router;
