import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { fleetKpis, assetMetrics } from './analytics.service.js';

const router = Router();

router.get(
  '/fleet-kpis',
  asyncHandler(async (_req, res) => {
    res.json(await fleetKpis());
  }),
);

router.get(
  '/assets',
  validate({
    query: z.object({
      overdueOnly: z.coerce.boolean().optional(),
      type: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    let rows = await assetMetrics();
    if (req.query.type) rows = rows.filter((r) => r.type === req.query.type);
    if (req.query.overdueOnly) rows = rows.filter((r) => r.service_overdue);
    res.json(rows);
  }),
);

export default router;
