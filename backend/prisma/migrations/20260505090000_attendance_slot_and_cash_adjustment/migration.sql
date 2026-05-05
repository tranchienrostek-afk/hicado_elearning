-- Create enums
CREATE TYPE "AttendanceSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM');
CREATE TYPE "AttendanceAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');
CREATE TYPE "PaymentAdjustmentSource" AS ENUM ('CASH', 'ADJUSTMENT');

-- Attendance extensions
ALTER TABLE "Attendance"
ADD COLUMN "slot" "AttendanceSlot" NOT NULL DEFAULT 'MORNING',
ADD COLUMN "sessionUnits" DOUBLE PRECISION NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "Attendance_classId_studentId_date_key";
CREATE UNIQUE INDEX "Attendance_classId_studentId_date_slot_key"
ON "Attendance"("classId", "studentId", "date", "slot");

-- Attendance audit trail
CREATE TABLE "AttendanceAudit" (
  "id" TEXT NOT NULL,
  "attendanceId" TEXT,
  "action" "AttendanceAuditAction" NOT NULL,
  "reason" TEXT,
  "classId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "oldStudentId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "oldDate" TIMESTAMP(3),
  "slot" "AttendanceSlot" NOT NULL,
  "oldSlot" "AttendanceSlot",
  "status" "AttendanceStatus" NOT NULL,
  "oldStatus" "AttendanceStatus",
  "sessionUnits" DOUBLE PRECISION NOT NULL,
  "oldSessionUnits" DOUBLE PRECISION,
  "note" TEXT,
  "oldNote" TEXT,
  "changedByUserId" TEXT,
  "changedByName" TEXT,
  "changedByRole" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AttendanceAudit"
ADD CONSTRAINT "AttendanceAudit_attendanceId_fkey"
FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual payment adjustments
CREATE TABLE "PaymentAdjustment" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "classId" TEXT,
  "source" "PaymentAdjustmentSource" NOT NULL DEFAULT 'CASH',
  "amount" INTEGER NOT NULL,
  "note" TEXT,
  "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "createdByRole" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAdjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentAdjustment"
ADD CONSTRAINT "PaymentAdjustment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

