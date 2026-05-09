-- Add fields required by the student duplicate-detection and merge workflow.
-- This migration is intentionally idempotent because production already had
-- schema/client drift from a previous deployment without the corresponding SQL.

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "phoneNorm" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "parentPhoneNorm" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "nameNorm" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "mergeReason" TEXT;

CREATE TABLE IF NOT EXISTS "StudentMergeAudit" (
  "id" TEXT NOT NULL,
  "sourceStudentId" TEXT NOT NULL,
  "targetStudentId" TEXT NOT NULL,
  "sourceSnapshot" TEXT NOT NULL,
  "targetSnapshot" TEXT NOT NULL,
  "movedRelations" TEXT NOT NULL,
  "reason" TEXT,
  "performedById" TEXT,
  "performedByName" TEXT,
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentMergeAudit_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentMergeAudit_sourceStudentId_fkey'
  ) THEN
    ALTER TABLE "StudentMergeAudit"
      ADD CONSTRAINT "StudentMergeAudit_sourceStudentId_fkey"
      FOREIGN KEY ("sourceStudentId") REFERENCES "Student"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentMergeAudit_targetStudentId_fkey'
  ) THEN
    ALTER TABLE "StudentMergeAudit"
      ADD CONSTRAINT "StudentMergeAudit_targetStudentId_fkey"
      FOREIGN KEY ("targetStudentId") REFERENCES "Student"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Student_phoneNorm_idx" ON "Student"("phoneNorm");
CREATE INDEX IF NOT EXISTS "Student_parentPhoneNorm_idx" ON "Student"("parentPhoneNorm");
CREATE INDEX IF NOT EXISTS "Student_nameNorm_idx" ON "Student"("nameNorm");
CREATE INDEX IF NOT EXISTS "Student_mergedIntoId_idx" ON "Student"("mergedIntoId");
CREATE INDEX IF NOT EXISTS "StudentMergeAudit_sourceStudentId_idx" ON "StudentMergeAudit"("sourceStudentId");
CREATE INDEX IF NOT EXISTS "StudentMergeAudit_targetStudentId_idx" ON "StudentMergeAudit"("targetStudentId");

WITH normalized AS (
  SELECT
    "id",
    regexp_replace(COALESCE("studentPhone", ''), '[^0-9]', '', 'g') AS student_digits,
    regexp_replace(COALESCE("parentPhone", ''), '[^0-9]', '', 'g') AS parent_digits,
    lower(trim(COALESCE("name", ''))) AS normalized_name
  FROM "Student"
)
UPDATE "Student" s
SET
  "phoneNorm" = CASE
    WHEN n.student_digits = '' THEN NULL
    WHEN n.student_digits LIKE '84%' AND length(n.student_digits) >= 11 THEN '0' || substring(n.student_digits FROM 3)
    WHEN length(n.student_digits) = 9 AND n.student_digits NOT LIKE '0%' THEN '0' || n.student_digits
    ELSE n.student_digits
  END,
  "parentPhoneNorm" = CASE
    WHEN n.parent_digits = '' THEN NULL
    WHEN n.parent_digits LIKE '84%' AND length(n.parent_digits) >= 11 THEN '0' || substring(n.parent_digits FROM 3)
    WHEN length(n.parent_digits) = 9 AND n.parent_digits NOT LIKE '0%' THEN '0' || n.parent_digits
    ELSE n.parent_digits
  END,
  "nameNorm" = CASE
    WHEN n.normalized_name = '' THEN NULL
    ELSE n.normalized_name
  END
FROM normalized n
WHERE s."id" = n."id"
  AND (s."phoneNorm" IS NULL OR s."parentPhoneNorm" IS NULL OR s."nameNorm" IS NULL);