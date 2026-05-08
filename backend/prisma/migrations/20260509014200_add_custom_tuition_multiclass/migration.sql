-- AlterTable
ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "coveredClassIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "customPayload" TEXT;
ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "messageType" TEXT;

-- GIN index bắt buộc cho toán tử @> (array contains) chạy hiệu quả
CREATE INDEX IF NOT EXISTS idx_zml_covered_class_ids
  ON "ZaloMessageLog" USING GIN ("coveredClassIds");

CREATE INDEX IF NOT EXISTS idx_zml_student_status
  ON "ZaloMessageLog" ("studentId", "status");
