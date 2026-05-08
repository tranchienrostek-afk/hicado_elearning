-- CreateTable
CREATE TABLE "ZaloMappingAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "zaloUserId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "previousTargetId" TEXT,
    "previousTargetName" TEXT,
    "performedBy" TEXT NOT NULL,
    "performedByName" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZaloMappingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_zaloUserId_key" ON "Teacher"("zaloUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_zaloUserId_key" ON "Student"("zaloUserId");

-- CreateIndex
CREATE INDEX "ZaloMappingAudit_zaloUserId_idx" ON "ZaloMappingAudit"("zaloUserId");

-- CreateIndex
CREATE INDEX "ZaloMappingAudit_targetId_idx" ON "ZaloMappingAudit"("targetId");

-- CreateIndex
CREATE INDEX "ZaloMappingAudit_performedAt_idx" ON "ZaloMappingAudit"("performedAt");
