-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SiteState" AS ENUM ('HEALTHY', 'BROKEN', 'DOUBTFUL', 'BLOCKED', 'MAINTENANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('HEALTHY', 'BROKEN', 'DOUBTFUL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VerdictSource" AS ENUM ('RULES', 'JUDGE');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('HTTP_ERROR', 'UNREACHABLE', 'CSS_FAILED', 'JS_FAILED', 'JS_ERROR', 'BLANK_PAGE', 'OTHER');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "clientName" TEXT,
    "sourceStatus" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "criticality" INTEGER NOT NULL DEFAULT 0,
    "alertEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentState" "SiteState" NOT NULL DEFAULT 'UNKNOWN',
    "stateSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stateReason" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "noiseCalibratedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownNoise" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sampleText" TEXT NOT NULL,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KnownNoise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "viewport" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "navigation" JSONB NOT NULL,
    "entries" JSONB NOT NULL,
    "dom" JSONB NOT NULL,
    "matchedRules" JSONB NOT NULL DEFAULT '[]',
    "verdict" "Verdict",
    "verdictSource" "VerdictSource",
    "incidentType" "IncidentType",
    "reason" TEXT,
    "judgeSuggestion" JSONB,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "firstCheckId" TEXT NOT NULL,
    "lastCheckId" TEXT NOT NULL,
    "notifiedOpenAt" TIMESTAMP(3),
    "notifiedResolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeUsage" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JudgeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sitesQueued" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CycleRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_externalId_key" ON "Site"("externalId");

-- CreateIndex
CREATE INDEX "Site_nextCheckAt_monitoringEnabled_idx" ON "Site"("nextCheckAt", "monitoringEnabled");

-- CreateIndex
CREATE INDEX "KnownNoise_siteId_isActive_idx" ON "KnownNoise"("siteId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "KnownNoise_siteId_signature_key" ON "KnownNoise"("siteId", "signature");

-- CreateIndex
CREATE INDEX "Check_siteId_startedAt_idx" ON "Check"("siteId", "startedAt");

-- CreateIndex
CREATE INDEX "Incident_siteId_resolvedAt_idx" ON "Incident"("siteId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeUsage_date_key" ON "JudgeUsage"("date");

-- CreateIndex
CREATE INDEX "CycleRun_kind_startedAt_idx" ON "CycleRun"("kind", "startedAt");

-- AddForeignKey
ALTER TABLE "KnownNoise" ADD CONSTRAINT "KnownNoise_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_firstCheckId_fkey" FOREIGN KEY ("firstCheckId") REFERENCES "Check"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_lastCheckId_fkey" FOREIGN KEY ("lastCheckId") REFERENCES "Check"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

