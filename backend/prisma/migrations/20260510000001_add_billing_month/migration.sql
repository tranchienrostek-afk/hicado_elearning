-- Add billingMonth to ZaloMessageLog and TuitionBill (added via db push, now formalized)
ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "billingMonth" TEXT;
ALTER TABLE "TuitionBill" ADD COLUMN IF NOT EXISTS "billingMonth" TEXT;
