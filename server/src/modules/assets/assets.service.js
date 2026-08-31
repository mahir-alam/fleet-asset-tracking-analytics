import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { assetMetricsById } from '../analytics/analytics.service.js';

export function listAssets({ type, status } = {}) {
  return prisma.asset.findMany({
    where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
    orderBy: { assetTag: 'asc' },
    include: {
      maintenanceFlags: {
        where: { status: { not: 'RESOLVED' } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function getAssetDetail(id) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      maintenanceFlags: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!asset) throw notFound('Asset not found');

  const [metrics, fuelLogs, downtimeEvents] = await Promise.all([
    assetMetricsById(id),
    prisma.fuelLog.findMany({ where: { assetId: id }, orderBy: { date: 'asc' } }),
    prisma.downtimeEvent.findMany({ where: { assetId: id }, orderBy: { startAt: 'desc' }, take: 50 }),
  ]);

  return { ...asset, metrics, fuelLogs, downtimeEvents };
}
