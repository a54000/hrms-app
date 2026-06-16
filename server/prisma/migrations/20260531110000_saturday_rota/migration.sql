CREATE TABLE "SaturdayRotaAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employeeId" UUID NOT NULL,
  "rotaDate" DATE NOT NULL,
  "isWorking" BOOLEAN NOT NULL DEFAULT true,
  "assignedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaturdayRotaAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaturdayRotaAssignment_employeeId_rotaDate_key" ON "SaturdayRotaAssignment"("employeeId", "rotaDate");
CREATE INDEX "SaturdayRotaAssignment_rotaDate_idx" ON "SaturdayRotaAssignment"("rotaDate");

ALTER TABLE "SaturdayRotaAssignment" ADD CONSTRAINT "SaturdayRotaAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaturdayRotaAssignment" ADD CONSTRAINT "SaturdayRotaAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
