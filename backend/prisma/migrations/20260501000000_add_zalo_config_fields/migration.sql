-- Add Zalo fields to Teacher
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "zaloUserId" TEXT;

-- Add Zalo and contact fields to Student
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "studentPhone" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "parentPhone" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "zaloUserId" TEXT;

-- Create ZaloTemplate table
CREATE TABLE IF NOT EXISTS "ZaloTemplate" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "previewUrl" TEXT,
    "price" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ZaloTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ZaloTemplate_templateId_key" ON "ZaloTemplate"("templateId");

-- Create ZaloMessageLog table
CREATE TABLE IF NOT EXISTS "ZaloMessageLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zaloUserId" TEXT,
    "templateId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "studentId" TEXT,
    CONSTRAINT "ZaloMessageLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ZaloMessageLog_trackingId_key" ON "ZaloMessageLog"("trackingId");
ALTER TABLE "ZaloMessageLog" DROP CONSTRAINT IF EXISTS "ZaloMessageLog_studentId_fkey";
ALTER TABLE "ZaloMessageLog" ADD CONSTRAINT "ZaloMessageLog_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create SystemConfig table
CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);
