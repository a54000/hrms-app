ALTER TABLE "Employee"
  ADD COLUMN "uan" TEXT,
  ADD COLUMN "aadhaarNumber" TEXT,
  ADD COLUMN "complianceStatus" TEXT NOT NULL DEFAULT 'Pending HR Verification';

