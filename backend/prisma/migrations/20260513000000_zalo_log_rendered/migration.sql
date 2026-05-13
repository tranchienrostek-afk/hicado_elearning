ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "renderedMessageText" TEXT;
ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "renderMetadata" TEXT;
