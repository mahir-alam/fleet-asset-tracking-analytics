import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, notFound } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { utilizationDaily } from '../analytics/analytics.service.js';

const router = Router();

const rangeSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) });
const idSchema = z.object({ assetId: z.string().min(1) });

async function assertAsset(assetId) {
  const found = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
  if (!found) throw notFound('Asset not found');
}

router.get(
  '/:assetId/utilization',
  validate({ params: idSchema, query: rangeSchema }),
  asyncHandler(async (req, res) => {
    await assertAsset(req.params.assetId);
    res.json(await utilizationDaily(req.params.assetId, req.query.days));
  }),
);

router.get(
  '/:assetId/fuel',
  validate({ params: idSchema, query: rangeSchema }),
  asyncHandler(async (req, res) => {
    await assertAsset(req.params.assetId);
    const since = new Date(Date.now() - req.query.days * 864e5);
    res.json(
      await prisma.fuelLog.findMany({
        where: { assetId: req.params.assetId, date: { gte: since } },
        orderBy: { date: 'asc' },
      }),
    );
  }),
);

router.get(
  '/:assetId/downtime',
  validate({ params: idSchema, query: rangeSchema }),
  asyncHandler(async (req, res) => {
    await assertAsset(req.params.assetId);
    const since = new Date(Date.now() - req.query.days * 864e5);
    res.json(
      await prisma.downtimeEvent.findMany({
        where: { assetId: req.params.assetId, startAt: { gte: since } },
        orderBy: { startAt: 'desc' },
      }),
    );
  }),
);

// Append a single utilization reading (used by the Python/PowerShell pipeline
// as an alternative to a bulk Excel ingest).
router.post(
  '/:assetId/utilization',
  validate({
    params: idSchema,
    body: z.object({
      date: z.coerce.date(),
      engineHours: z.number().min(0).max(24),
      idleHours: z.number().min(0).max(24).default(0),
      distanceKm: z.number().min(0).default(0),
      payloadTonnes: z.number().min(0).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await assertAsset(req.params.assetId);
    const { date, ...rest } = req.body;
    const row = await prisma.utilizationLog.upsert({
      where: { assetId_date: { assetId: req.params.assetId, date } },
      create: { assetId: req.params.assetId, date, ...rest },
      update: rest,
    });
    res.status(201).json(row);
  }),
);

export default router;
