import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { assetMetrics } from '../analytics/analytics.service.js';
import { evaluateAsset, TICKETABLE_KINDS } from './rules.js';
import { createTicketFromFlag } from '../integration/ticketClient.js';

/**
 * For every non-retired asset: raise a MaintenanceFlag for each newly breached
 * threshold (one non-RESOLVED flag per asset + kind), and for ticketable kinds
 * create a ticket in the IT ticketing system. A ticketable flag that is still
 * OPEN from an earlier run (its ticket call failed then) is retried on the next
 * evaluation, so a ticketing-system outage doesn't leave it permanently
 * un-ticketed.
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

  // Call the ticketing system for one flag and record the attempt. Used both
  // for a freshly raised flag and to retry a flag that was raised earlier but
  // never ticketed (the ticketing system was down at the time).
  async function attemptTicket(flag, asset) {
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
      summary.ticketsCreated += 1;
      return markTicketed(flag.id, {
        status: 'TICKETED',
        externalTicketNumber: outcome.ticketNumber ?? null,
        externalTicketId: outcome.ticketId ?? null,
      });
    }
    summary.ticketFailures += 1;
    logger.warn(`flag ${flag.id} (${flag.kind}) not ticketed: ${outcome.error}`);
    return flag;
  }

  for (const asset of assets) {
    const findings = evaluateAsset(asset, metricsById.get(asset.id) ?? {});

    for (const finding of findings) {
      const ticketable = createTickets && TICKETABLE_KINDS.includes(finding.kind);

      const existing = await findActiveFlag(asset.id, finding.kind);
      if (existing) {
        summary.flags.push(
          ticketable && existing.status === 'OPEN' ? await attemptTicket(existing, asset) : existing,
        );
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

      summary.flags.push(ticketable ? await attemptTicket(flag, asset) : flag);
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
