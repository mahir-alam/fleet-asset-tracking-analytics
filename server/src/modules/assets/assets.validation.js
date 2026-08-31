import { z } from 'zod';

export const ASSET_TYPES = ['HAUL_TRUCK', 'EXCAVATOR', 'DOZER', 'LOADER', 'GRADER', 'WATER_TRUCK'];
export const ASSET_STATUSES = ['ACTIVE', 'DOWN', 'MAINTENANCE', 'RETIRED'];

export const listAssetsSchema = z.object({
  type: z.enum(ASSET_TYPES).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
});

export const assetIdSchema = z.object({
  id: z.string().min(1),
});
