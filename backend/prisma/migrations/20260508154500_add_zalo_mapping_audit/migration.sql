-- CreateTable
CREATE TABLE "ZaloMappingAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "zaloUserId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "previousTargetId" TEXT,
    "previousTargetName" TEXT,
    "performedBy" TEXT NOT NULL,
    "performedByName" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZaloMappingAudit_pkey" PRIMARY KEY ("id")
);

-- Preflight: Cleanup duplicates in Teacher table (keep newest)
WITH Duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "zaloUserId" ORDER BY "updatedAt" DESC) as rnk
    FROM "Teacher"
    WHERE "zaloUserId" IS NOT NULL
)
UPDATE "Teacher" SET "zaloUserId" = NULL WHERE id IN (SELECT id FROM Duplicates WHERE rnk > 1);

-- Preflight: Cleanup duplicates in Student table (keep newest)
WITH Duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "zaloUserId" ORDER BY "updatedAt" DESC) as rnk
    FROM "Student"
    WHERE "zaloUserId" IS NOT NULL
)
UPDATE "Student" SET "zaloUserId" = NULL WHERE id IN (SELECT id FROM Duplicates WHERE rnk > 1);

-- Preflight: Cleanup cross-table duplicates (prefer Teacher, clear Student)
UPDATE "Student" SET "zaloUserId" = NULL 
WHERE "zaloUserId" IS NOT NULL 
AND "zaloUserId" IN (SELECT "zaloUserId" FROM "Teacher" WHERE "zaloUserId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_zaloUserId_key" ON "Teacher"("zaloUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_zaloUserId_key" ON "Student"("zaloUserId");

-- CreateIndex
CREATE INDEX "ZaloMappingAudit_zaloUserId_idx" ON "ZaloMappingAudit"("zaloUserId");

-- CreateIndex
CREATE INDEX "ZaloMappingAudit_targetId_idx" ON "ZaloMappingAudit"("targetId");

-- CreateIndex
CREATE INDEX "ZaloMappingAudit_performedAt_idx" ON "ZaloMappingAudit"("performedAt");
