-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "billId" TEXT;

-- CreateTable
CREATE TABLE "TuitionBill" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "coveredClassIds" TEXT[],
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "sessionsDetail" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "referenceCode" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "transactionId" TEXT,
    "adjustmentId" TEXT,
    "note" TEXT,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TuitionBill_referenceCode_key" ON "TuitionBill"("referenceCode");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ZaloMessageLog_billId_fkey') THEN
    ALTER TABLE "ZaloMessageLog" ADD CONSTRAINT "ZaloMessageLog_billId_fkey" FOREIGN KEY ("billId") REFERENCES "TuitionBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TuitionBill_studentId_fkey') THEN
    ALTER TABLE "TuitionBill" ADD CONSTRAINT "TuitionBill_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillPayment_billId_fkey') THEN
    ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "TuitionBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
