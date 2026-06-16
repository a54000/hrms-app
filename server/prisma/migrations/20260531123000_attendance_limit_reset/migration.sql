CREATE TABLE "AttendanceLimitResetRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employeeId" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL,
  "justification" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
  "approverId" UUID,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceLimitResetRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceLimitResetRequest_employeeId_month_status_idx" ON "AttendanceLimitResetRequest"("employeeId", "month", "status");
CREATE INDEX "AttendanceLimitResetRequest_status_idx" ON "AttendanceLimitResetRequest"("status");

ALTER TABLE "AttendanceLimitResetRequest" ADD CONSTRAINT "AttendanceLimitResetRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceLimitResetRequest" ADD CONSTRAINT "AttendanceLimitResetRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
