CREATE TABLE "SecuritySetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "loginDeviceRestrictionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginDevice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deviceKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "lastUserAgent" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginDevice_deviceKey_key" ON "LoginDevice"("deviceKey");
CREATE UNIQUE INDEX "LoginDevice_fingerprintHash_key" ON "LoginDevice"("fingerprintHash");
CREATE INDEX "LoginDevice_isActive_idx" ON "LoginDevice"("isActive");
CREATE INDEX "LoginDevice_approvedById_idx" ON "LoginDevice"("approvedById");

ALTER TABLE "LoginDevice" ADD CONSTRAINT "LoginDevice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SecuritySetting" ("id", "loginDeviceRestrictionEnabled", "updatedAt")
VALUES ('default', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
