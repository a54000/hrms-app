CREATE TYPE "ClientStatus" AS ENUM ('active', 'paused', 'inactive');
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'raised', 'paid', 'cancelled');

CREATE TABLE "Client" (
  "id" UUID NOT NULL,
  "clientCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ClientStatus" NOT NULL DEFAULT 'active',
  "industry" TEXT,
  "workingSince" DATE,
  "owner" TEXT,
  "pitchdeck" TEXT,
  "customizedPitch" TEXT,
  "proposals" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientInvoice" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceMonth" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dueDate" DATE,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "externalRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAgreement" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientAgreement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_clientCode_key" ON "Client"("clientCode");
CREATE INDEX "Client_status_idx" ON "Client"("status");
CREATE UNIQUE INDEX "ClientInvoice_clientId_invoiceNumber_key" ON "ClientInvoice"("clientId", "invoiceNumber");
CREATE INDEX "ClientInvoice_clientId_invoiceMonth_idx" ON "ClientInvoice"("clientId", "invoiceMonth");
CREATE INDEX "ClientAgreement_clientId_idx" ON "ClientAgreement"("clientId");

ALTER TABLE "ClientInvoice" ADD CONSTRAINT "ClientInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAgreement" ADD CONSTRAINT "ClientAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
