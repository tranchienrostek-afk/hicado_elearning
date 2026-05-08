-- Add missing Student notes column required by the current Prisma schema/client.
-- The previous profile-fields migration was already applied in production but did not include this column.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "notes" TEXT;
