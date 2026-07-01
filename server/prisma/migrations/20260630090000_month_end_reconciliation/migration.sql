-- Month-end reconciliation ledger additions.
-- No historical backfill is performed by this migration; all transactions start logging forward only.

CREATE TYPE "ReconciliationExceptionType" AS ENUM (
  'leave_approved_but_no_balance_reduction',
  'balance_reduced_without_leave_approval',
  'leave_applied_on_non_working_day',
  'attendance_present_on_approved_leave_day',
  'unpaid_leave_counted_as_paid',
  'negative_balance',
  'leave_days_mismatch_calendar'
);

CREATE TYPE "ReconciliationStatus" AS ENUM ('draft', 'reviewed', 'locked');

CREATE TABLE "LeaveBalanceTransaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employeeId" UUID NOT NULL,
  "leaveType" TEXT NOT NULL,
  "transactionDate" DATE NOT NULL,
  "amount" DECIMAL(8,2) NOT NULL,
  "balanceAfter" DECIMAL(8,2) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" UUID,
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveBalanceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollReconciliation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payrollCycleId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "month" DATE NOT NULL,
  "workDays" DECIMAL(6,2) NOT NULL,
  "presentDays" DECIMAL(6,2) NOT NULL,
  "paidLeaveDays" DECIMAL(6,2) NOT NULL,
  "unpaidLeaveDays" DECIMAL(6,2) NOT NULL,
  "absentDays" DECIMAL(6,2) NOT NULL,
  "balanceConsumed" DECIMAL(8,2) NOT NULL,
  "balanceRemaining" DECIMAL(8,2) NOT NULL,
  "status" "ReconciliationStatus" NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationException" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payrollReconciliationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "date" DATE,
  "exceptionType" "ReconciliationExceptionType" NOT NULL,
  "severity" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeaveBalanceTransaction_employeeId_leaveType_idx" ON "LeaveBalanceTransaction"("employeeId", "leaveType");
CREATE INDEX "LeaveBalanceTransaction_transactionDate_idx" ON "LeaveBalanceTransaction"("transactionDate");
CREATE INDEX "LeaveBalanceTransaction_sourceType_sourceId_idx" ON "LeaveBalanceTransaction"("sourceType", "sourceId");

CREATE UNIQUE INDEX "PayrollReconciliation_payrollCycleId_employeeId_month_key" ON "PayrollReconciliation"("payrollCycleId", "employeeId", "month");
CREATE INDEX "PayrollReconciliation_employeeId_month_idx" ON "PayrollReconciliation"("employeeId", "month");

CREATE INDEX "ReconciliationException_payrollReconciliationId_exceptionType_idx" ON "ReconciliationException"("payrollReconciliationId", "exceptionType");
CREATE INDEX "ReconciliationException_employeeId_date_idx" ON "ReconciliationException"("employeeId", "date");

ALTER TABLE "LeaveBalanceTransaction" ADD CONSTRAINT "LeaveBalanceTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalanceTransaction" ADD CONSTRAINT "LeaveBalanceTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollReconciliation" ADD CONSTRAINT "PayrollReconciliation_payrollCycleId_fkey" FOREIGN KEY ("payrollCycleId") REFERENCES "PayrollCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollReconciliation" ADD CONSTRAINT "PayrollReconciliation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_payrollReconciliationId_fkey" FOREIGN KEY ("payrollReconciliationId") REFERENCES "PayrollReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
