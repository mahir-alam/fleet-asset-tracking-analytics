import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../../lib/errors.js';
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
 * "Send test alert" button. Builds a synthetic flag for a real asset and fires
 * the same integration path used by the pipeline. The flag is NOT persisted;
 * the IntegrationEvent IS, so it shows up in the Alerts page audit log.
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

    if (env.integration.mode === 'disabled') {
      throw badRequest('Integration is disabled (INTEGRATION_MODE=disabled)');
    }

    const kind = req.body.kind ?? 'EXCESSIVE_DOWNTIME';
    const syntheticFlag = {
      id: `demo-${Date.now()}`,
      kind,
      detail: 'Synthetic alert generated from the dashboard "Send test alert" control.',
      thresholdValue: 0,
      observedValue: 0,
    };

    const outcome = await createTicketFromFlag({
      flag: syntheticFlag,
      asset,
      externalRef: syntheticFlag.id,
    });

    await prisma.integrationEvent.create({
      data: {
        maintenanceFlagId: null,
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
