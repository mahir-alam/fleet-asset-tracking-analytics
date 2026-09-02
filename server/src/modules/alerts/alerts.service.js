import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { assetMetrics } from '../analytics/analytics.service.js';
import { evaluateAsset, TICKETABLE_KINDS } from './rules.js';
import { createTicketFromFlag } from '../integration/ticketClient.js';

/**
 * For every non-retired asset: raise a MaintenanceFlag for each newly breached
 * threshold (one non-RESOLVED flag per asset + kind), and for ticketable kinds
 * create a ticket in the IT ticketing system.
 *
 * The database and ticket-client calls are passed in via `deps` so the function
 * can be tested without a database or network.
 */
export async function runFleetEvaluation({
  createTickets = true,
  deps = {},
} = {}) {
  const {
    getAssets = () => prisma.asset.findMany({ where: { status: { not: 'RETIRED' } } }),
    getMetrics = () => assetMetrics(),
    findActiveFlag = (assetId, kind) =>
      prisma.maintenanceFlag.findFirst({ where: { assetId, kind, status: { not: 'RESOLVED' } } }),
    createFlag = (data) => prisma.maintenanceFlag.create({ data }),
    recordIntegrationEvent = (data) => prisma.integrationEvent.create({ data }),
    markTicketed = (id, data) => prisma.maintenanceFlag.update({ where: { id }, data }),
    ticketClient = createTicketFromFlag,
  } = deps;

  const [assets, metrics] = await Promise.all([getAssets(), getMetrics()]);
  const metricsById = new Map(metrics.map((m) => [m.assetId, m]));

  const summary = { evaluated: assets.length, newFlags: 0, ticketsCreated: 0, ticketFailures: 0, flags: [] };

  for (const asset of assets) {
    const findings = evaluateAsset(asset, metricsById.get(asset.id) ?? {});

    for (const finding of findings) {
      const existing = await findActiveFlag(asset.id, finding.kind);
      if (existing) {
        summary.flags.push(existing);
        continue;
      }

      let flag;
      try {
        flag = await createFlag({
          assetId: asset.id,
          kind: finding.kind,
          detail: finding.detail,
          thresholdValue: finding.thresholdValue,
          observedValue: finding.observedValue,
        });
      } catch (err) {
        // Concurrent evaluation already inserted this flag (partial unique index).
        if (err?.code === 'P2002') {
          const raced = await findActiveFlag(asset.id, finding.kind);
          if (raced) summary.flags.push(raced);
          continue;
        }
        throw err;
      }
      summary.newFlags += 1;

      if (createTickets && TICKETABLE_KINDS.includes(finding.kind)) {
        const outcome = await ticketClient({ flag, asset });
        await recordIntegrationEvent({
          maintenanceFlagId: flag.id,
          endpoint: outcome.endpoint,
          requestPayload: outcome.requestPayload,
          responseStatus: outcome.status ?? null,
          responseBody: outcome.raw ?? null,
          ticketNumber: outcome.ticketNumber ?? null,
          ok: outcome.ok,
          errorMessage: outcome.error ?? null,
        });

        if (outcome.ok) {
          flag = await markTicketed(flag.id, {
            status: 'TICKETED',
            externalTicketNumber: outcome.ticketNumber ?? null,
            externalTicketId: outcome.ticketId ?? null,
          });
          summary.ticketsCreated += 1;
        } else {
          summary.ticketFailures += 1;
          logger.warn(`flag ${flag.id} (${finding.kind}) not ticketed: ${outcome.error}`);
        }
      }

      summary.flags.push(flag);
    }
  }

  logger.info(
    `Fleet evaluation: ${summary.evaluated} assets, ${summary.newFlags} new flags, ` +
      `${summary.ticketsCreated} tickets (${summary.ticketFailures} failed)`,
  );
  return summary;
}

export function listFlags({ status, kind, assetId } = {}) {
  return prisma.maintenanceFlag.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(assetId ? { assetId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { asset: { select: { id: true, assetTag: true, name: true, type: true } } },
  });
}

export function resolveFlag(id) {
  return prisma.maintenanceFlag.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
}
