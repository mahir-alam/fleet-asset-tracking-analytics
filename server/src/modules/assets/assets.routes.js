import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { listAssetsSchema, assetIdSchema } from './assets.validation.js';
import { listAssets, getAssetDetail } from './assets.service.js';

const router = Router();

router.get(
  '/',
  validate({ query: listAssetsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listAssets(req.query));
  }),
);

router.get(
  '/:id',
  validate({ params: assetIdSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getAssetDetail(req.params.id));
  }),
);

export default router;
