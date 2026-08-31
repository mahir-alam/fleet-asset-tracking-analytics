import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { runFleetEvaluation, listFlags, resolveFlag } from './alerts.service.js';

const router = Router();

const FLAG_KINDS = ['SERVICE_DUE', 'SERVICE_OVERDUE', 'LOW_UTILIZATION', 'HIGH_FUEL_BURN', 'EXCESSIVE_DOWNTIME'];
const FLAG_STATUSES = ['OPEN', 'TICKETED', 'RESOLVED'];

router.post(
  '/evaluate',
  validate({ body: z.object({ createTickets: z.boolean().default(true) }).partial() }),
  asyncHandler(async (req, res) => {
    const summary = await runFleetEvaluation({ createTickets: req.body.createTickets ?? true });
    res.json(summary);
  }),
);

router.get(
  '/flags',
  validate({
    query: z.object({
      status: z.enum(FLAG_STATUSES).optional(),
      kind: z.enum(FLAG_KINDS).optional(),
      assetId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json(await listFlags(req.query));
  }),
);

router.post(
  '/flags/:id/resolve',
  validate({ params: z.object({ id: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.maintenanceFlag.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Flag not found');
    res.json(await resolveFlag(req.params.id));
  }),
);

export default router;
