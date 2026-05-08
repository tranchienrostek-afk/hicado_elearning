-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalaryType') THEN
        CREATE TYPE "SalaryType" AS ENUM ('PERCENT', 'HOURLY');
    END IF;
END $$;

-- AlterTable Teacher
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "hourlyRate" DOUBLE PRECISION;
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "salaryType" "SalaryType" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Student
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Class
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "roomId2" TEXT;
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "scheduleTime2" TEXT;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Class_roomId2_fkey'
    ) THEN
        ALTER TABLE "Class"
        ADD CONSTRAINT "Class_roomId2_fkey"
        FOREIGN KEY ("roomId2") REFERENCES "Room"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
