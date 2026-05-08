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

-- PREFLIGHT CHECK (Fail-Fast): Ensure no duplicate zaloUserId exist before creating unique index
-- If this fails, please run the following query to find duplicates:
-- SELECT "zaloUserId", COUNT(*) FROM "Student" WHERE "zaloUserId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
-- SELECT "zaloUserId", COUNT(*) FROM "Teacher" WHERE "zaloUserId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
-- SELECT s."zaloUserId", s.id AS "studentId", s.name AS "studentName", t.id AS "teacherId", t.name AS "teacherName"
-- FROM "Student" s JOIN "Teacher" t ON t."zaloUserId" = s."zaloUserId"
-- WHERE s."zaloUserId" IS NOT NULL;

DO $$
BEGIN
    -- Check duplicates in Teacher
    IF EXISTS (SELECT 1 FROM "Teacher" WHERE "zaloUserId" IS NOT NULL GROUP BY "zaloUserId" HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Migration failed: Duplicate zaloUserId found in Teacher table.';
    END IF;

    -- Check duplicates in Student
    IF EXISTS (SELECT 1 FROM "Student" WHERE "zaloUserId" IS NOT NULL GROUP BY "zaloUserId" HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Migration failed: Duplicate zaloUserId found in Student table.';
    END IF;

    -- Check cross-table duplicates
    IF EXISTS (
        SELECT 1 FROM "Student" s 
        WHERE s."zaloUserId" IS NOT NULL 
        AND s."zaloUserId" IN (SELECT "zaloUserId" FROM "Teacher" WHERE "zaloUserId" IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Migration failed: Cross-table duplicate zaloUserId found (exists in both Student and Teacher).';
    END IF;
END $$;

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
