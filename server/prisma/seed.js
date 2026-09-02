import { readFileSync, existsSync } from 'node:fs';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: new URL('../../.env', import.meta.url) });

const prisma = new PrismaClient();
const DATA_PATH = new URL('./seed-data.json', import.meta.url);

const FORCED = process.argv.slice(2).includes('--force') || process.env.SEED_FORCE === '1';

/**
 * This script deletes every row in the database and re-inserts the sample
 * dataset. It must never run automatically (build step, redeploy, migration
 * hook) — it is a one-time manual step for a fresh local or demo database.
 *
 * It refuses to run against a database that looks non-local unless invoked
 * explicitly with `--force` (or SEED_FORCE=1).
 */
function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  const localHosts = ['localhost', '127.0.0.1', '::1', 'db'];
  const looksLocal = localHosts.includes(host);
  const isProd = process.env.NODE_ENV === 'production';

  if ((isProd || !looksLocal) && !FORCED) {
    console.error(
      '\nRefusing to seed: this wipes all data and the target is not a local\n' +
        `database (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}, host=${host || 'unknown'}).\n` +
        'Re-run with --force if you are certain you want to reset this database.\n',
    );
    process.exit(1);
  }
}

function loadSeed() {
  if (!existsSync(DATA_PATH)) {
    console.error(
      '\nseed-data.json not found. Generate it first:\n' +
        '  python data/generate_sample_data.py\n',
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(DATA_PATH, 'utf8'));
}

async function main() {
  assertSafeTarget();
  const seed = loadSeed();

  console.log('Clearing existing data…');
  await prisma.integrationEvent.deleteMany();
  await prisma.maintenanceFlag.deleteMany();
  await prisma.downtimeEvent.deleteMany();
  await prisma.fuelLog.deleteMany();
  await prisma.utilizationLog.deleteMany();
  await prisma.asset.deleteMany();

  console.log(`Inserting ${seed.assets.length} assets…`);
  const tagToId = new Map();
  for (const a of seed.assets) {
    const created = await prisma.asset.create({
      data: {
        assetTag: a.assetTag,
        name: a.name,
        type: a.type,
        site: a.site,
        model: a.model,
        commissionedAt: new Date(a.commissionedAt),
        scheduledHoursPerDay: a.scheduledHoursPerDay,
        serviceIntervalHours: a.serviceIntervalHours,
        lastServiceHours: a.lastServiceHours,
        currentEngineHours: a.currentEngineHours,
        status: a.status ?? 'ACTIVE',
      },
    });
    tagToId.set(a.assetTag, created.id);
  }

  const mapRows = (rows, fn) => rows.map((r) => ({ assetId: tagToId.get(r.assetTag), ...fn(r) }));

  const utilization = mapRows(seed.utilizationLogs, (r) => ({
    date: new Date(r.date),
    engineHours: r.engineHours,
    idleHours: r.idleHours,
    distanceKm: r.distanceKm,
    payloadTonnes: r.payloadTonnes ?? null,
  }));
  const fuel = mapRows(seed.fuelLogs, (r) => ({
    date: new Date(r.date),
    litres: r.litres,
    cost: r.cost,
    engineHoursAtFill: r.engineHoursAtFill,
  }));
  const downtime = mapRows(seed.downtimeEvents, (r) => ({
    startAt: new Date(r.startAt),
    endAt: r.endAt ? new Date(r.endAt) : null,
    category: r.category,
    reason: r.reason,
    hours: r.hours,
  }));

  console.log(`Inserting ${utilization.length} utilization, ${fuel.length} fuel, ${downtime.length} downtime rows…`);
  await prisma.utilizationLog.createMany({ data: utilization });
  await prisma.fuelLog.createMany({ data: fuel });
  await prisma.downtimeEvent.createMany({ data: downtime });

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
