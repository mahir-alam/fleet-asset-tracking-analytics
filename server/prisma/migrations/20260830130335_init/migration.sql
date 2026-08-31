-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('HAUL_TRUCK', 'EXCAVATOR', 'DOZER', 'LOADER', 'GRADER', 'WATER_TRUCK');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DOWN', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DowntimeCategory" AS ENUM ('UNPLANNED', 'PLANNED', 'STANDBY');

-- CreateEnum
CREATE TYPE "FlagKind" AS ENUM ('SERVICE_DUE', 'SERVICE_OVERDUE', 'LOW_UTILIZATION', 'HIGH_FUEL_BURN', 'EXCESSIVE_DOWNTIME');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'TICKETED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "site" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "commissionedAt" TIMESTAMP(3) NOT NULL,
    "scheduledHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "serviceIntervalHours" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "lastServiceHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentEngineHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilizationLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "engineHours" DOUBLE PRECISION NOT NULL,
    "idleHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payloadTonnes" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilizationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "engineHoursAtFill" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "category" "DowntimeCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceFlag" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "FlagKind" NOT NULL,
    "detail" TEXT NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "observedValue" DOUBLE PRECISION NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "externalTicketNumber" TEXT,
    "externalTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "maintenanceFlagId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "endpoint" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "ticketNumber" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");

-- CreateIndex
CREATE INDEX "Asset_type_idx" ON "Asset"("type");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "UtilizationLog_date_idx" ON "UtilizationLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "UtilizationLog_assetId_date_key" ON "UtilizationLog"("assetId", "date");

-- CreateIndex
CREATE INDEX "FuelLog_date_idx" ON "FuelLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FuelLog_assetId_date_key" ON "FuelLog"("assetId", "date");

-- CreateIndex
CREATE INDEX "DowntimeEvent_assetId_startAt_idx" ON "DowntimeEvent"("assetId", "startAt");

-- CreateIndex
CREATE INDEX "DowntimeEvent_category_idx" ON "DowntimeEvent"("category");

-- CreateIndex
CREATE INDEX "MaintenanceFlag_assetId_kind_status_idx" ON "MaintenanceFlag"("assetId", "kind", "status");

-- CreateIndex
CREATE INDEX "MaintenanceFlag_status_idx" ON "MaintenanceFlag"("status");

-- CreateIndex
CREATE INDEX "IntegrationEvent_createdAt_idx" ON "IntegrationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_ok_idx" ON "IntegrationEvent"("ok");

-- AddForeignKey
ALTER TABLE "UtilizationLog" ADD CONSTRAINT "UtilizationLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceFlag" ADD CONSTRAINT "MaintenanceFlag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_maintenanceFlagId_fkey" FOREIGN KEY ("maintenanceFlagId") REFERENCES "MaintenanceFlag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
