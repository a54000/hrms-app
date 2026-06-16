ALTER TABLE "Employee" ADD COLUMN "legalEntity" TEXT NOT NULL DEFAULT 'HRGP';

DROP INDEX IF EXISTS "Employee_employeeCode_key";

CREATE UNIQUE INDEX "Employee_employeeCode_legalEntity_key" ON "Employee"("employeeCode", "legalEntity");
CREATE INDEX "Employee_legalEntity_idx" ON "Employee"("legalEntity");
