ALTER TABLE "LoginDevice"
ADD COLUMN "deviceName" TEXT,
ADD COLUMN "deviceType" TEXT,
ADD COLUMN "platform" TEXT,
ADD COLUMN "browser" TEXT,
ADD COLUMN "lastLocation" TEXT;

CREATE TABLE "LoginEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "loginDeviceId" UUID,
    "emailOrLogin" TEXT,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "timezone" TEXT,
    "language" TEXT,
    "deviceName" TEXT,
    "deviceType" TEXT,
    "platform" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");
CREATE INDEX "LoginEvent_loginDeviceId_createdAt_idx" ON "LoginEvent"("loginDeviceId", "createdAt");
CREATE INDEX "LoginEvent_successful_createdAt_idx" ON "LoginEvent"("successful", "createdAt");

ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_loginDeviceId_fkey" FOREIGN KEY ("loginDeviceId") REFERENCES "LoginDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
