-- Create Campaign table
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'DRAFT',
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "sentCount"   INTEGER NOT NULL DEFAULT 0,
    "readCount"   INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt"      TIMESTAMP(3),
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- Extend ZaloMessageLog
ALTER TABLE "ZaloMessageLog"
    ADD COLUMN IF NOT EXISTS "campaignId"  TEXT,
    ADD COLUMN IF NOT EXISTS "zaloMsgId"   TEXT,
    ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "classId"     TEXT;

-- FK: ZaloMessageLog → Campaign
ALTER TABLE "ZaloMessageLog"
    DROP CONSTRAINT IF EXISTS "ZaloMessageLog_campaignId_fkey";
ALTER TABLE "ZaloMessageLog"
    ADD CONSTRAINT "ZaloMessageLog_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for webhook read-receipt lookup and campaign queries
CREATE INDEX IF NOT EXISTS "ZaloMessageLog_zaloUserId_status_idx" ON "ZaloMessageLog"("zaloUserId", "status");
CREATE INDEX IF NOT EXISTS "ZaloMessageLog_campaignId_idx" ON "ZaloMessageLog"("campaignId");
