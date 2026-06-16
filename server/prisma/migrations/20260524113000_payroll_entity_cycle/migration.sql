ALTER TABLE "PayrollCycle" ADD COLUMN "legalEntity" TEXT NOT NULL DEFAULT 'HRGP';

DROP INDEX IF EXISTS "PayrollCycle_payrollMonth_key";

CREATE UNIQUE INDEX "PayrollCycle_payrollMonth_legalEntity_key" ON "PayrollCycle"("payrollMonth", "legalEntity");
