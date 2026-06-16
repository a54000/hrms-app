CREATE TABLE "Holiday" (
  "id" UUID NOT NULL,
  "holidayDate" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'National',
  "legalEntity" TEXT,
  "location" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Holiday_holidayDate_name_legalEntity_location_key" ON "Holiday"("holidayDate", "name", "legalEntity", "location");
CREATE INDEX "Holiday_holidayDate_idx" ON "Holiday"("holidayDate");
CREATE INDEX "Holiday_legalEntity_location_idx" ON "Holiday"("legalEntity", "location");
