ALTER TABLE "LeaveRequest" ADD COLUMN "createdById" UUID;

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
