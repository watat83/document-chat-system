-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UsageType" ADD VALUE 'OPPORTUNITY_MATCH';
ALTER TYPE "UsageType" ADD VALUE 'MATCH_SCORE_CALCULATION';
ALTER TYPE "UsageType" ADD VALUE 'SAVED_FILTER';
ALTER TYPE "UsageType" ADD VALUE 'SAVED_SEARCH';

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "filters" JSONB NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sharedBy" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_searches_organizationId_userId_deletedAt_idx" ON "saved_searches"("organizationId", "userId", "deletedAt");

-- CreateIndex
CREATE INDEX "saved_searches_organizationId_isShared_deletedAt_idx" ON "saved_searches"("organizationId", "isShared", "deletedAt");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep one active default per user, including concurrent requests.
CREATE UNIQUE INDEX "saved_searches_one_active_default" ON "saved_searches" ("organizationId", "userId")
WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- Prisma uses the server role. Do not expose saved filters through the Data API.
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "saved_searches" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "saved_searches" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "saved_searches" FROM authenticated;
  END IF;
END $$;
