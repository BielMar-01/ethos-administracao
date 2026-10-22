BEGIN;

-- Additive application schema only. No existing Supabase objects are changed.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ethos";

-- CreateEnum
CREATE TYPE "ethos"."OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ethos"."MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ethos"."PersonKind" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "ethos"."PropertyKind" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'LAND');

-- CreateEnum
CREATE TYPE "ethos"."LeaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ethos"."LeasePartyRole" AS ENUM ('PRIMARY', 'CO_RESPONSIBLE', 'OCCUPANT');

-- CreateEnum
CREATE TYPE "ethos"."ContractStatus" AS ENUM ('DRAFT', 'SIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ethos"."ChangeStatus" AS ENUM ('PROPOSED', 'APPROVED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ethos"."ChargeKind" AS ENUM ('RENT', 'CONDOMINIUM', 'TAX', 'UTILITY', 'PENALTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ethos"."ChargeStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ethos"."PaymentMethod" AS ENUM ('PIX', 'BANK_TRANSFER', 'BANK_SLIP', 'CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "ethos"."PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ethos"."ReceiptStatus" AS ENUM ('ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ethos"."InspectionKind" AS ENUM ('ENTRY', 'EXIT', 'PERIODIC');

-- CreateEnum
CREATE TYPE "ethos"."ReportStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "ethos"."DocumentKind" AS ENUM ('PHOTO', 'CONTRACT', 'RECEIPT', 'REPORT', 'IDENTITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ethos"."MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ethos"."Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ethos"."NotificationKind" AS ENUM ('BILLING', 'CONTRACT', 'MAINTENANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ethos"."PlatformRole" AS ENUM ('SUPER_ADMIN');

-- CreateTable
CREATE TABLE "ethos"."Organization" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "status" "ethos"."OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."ExternalIdentity" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Permission" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."PlatformAccessGrant" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "role" "ethos"."PlatformRole" NOT NULL,
    "grantedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,

    CONSTRAINT "PlatformAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."PlatformAuditLog" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "targetUserId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "reason" TEXT NOT NULL,
    "databaseRole" VARCHAR(100) NOT NULL,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."OrganizationSettings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "preferences" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."OrganizationMembership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "status" "ethos"."MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."MembershipRole" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membershipId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."RolePermission" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Owner" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "kind" "ethos"."PersonKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "taxIdentifier" VARCHAR(30),
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Tenant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "kind" "ethos"."PersonKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "taxIdentifier" VARCHAR(30),
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Property" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" "ethos"."PropertyKind" NOT NULL,
    "address" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."PropertyUnit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "area" DECIMAL(12,2),
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PropertyUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."PropertyOwnership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,

    CONSTRAINT "PropertyOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Lease" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "status" "ethos"."LeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "baseRent" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "dueDay" INTEGER NOT NULL,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."LeaseTenant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "role" "ethos"."LeasePartyRole" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,

    CONSTRAINT "LeaseTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Contract" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "status" "ethos"."ContractStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."ContractVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "validFrom" DATE NOT NULL,
    "signedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."LeaseRenewal" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID NOT NULL,
    "successorLeaseId" UUID,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "newRent" DECIMAL(18,2) NOT NULL,
    "status" "ethos"."ChangeStatus" NOT NULL DEFAULT 'PROPOSED',

    CONSTRAINT "LeaseRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."RentAdjustment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "previousRent" DECIMAL(18,2) NOT NULL,
    "newRent" DECIMAL(18,2) NOT NULL,
    "percentage" DECIMAL(9,4) NOT NULL,
    "indexName" VARCHAR(80),
    "status" "ethos"."ChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "appliedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Charge" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "kind" "ethos"."ChargeKind" NOT NULL,
    "competence" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "ethos"."ChargeStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Installment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chargeId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "dueOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "ethos"."PaymentMethod" NOT NULL,
    "status" "ethos"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "reversedAt" TIMESTAMPTZ(3),
    "externalReference" VARCHAR(255),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."PaymentAllocation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Receipt" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" UUID NOT NULL,
    "number" VARCHAR(80) NOT NULL,
    "status" "ethos"."ReceiptStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Inspection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitId" UUID NOT NULL,
    "leaseId" UUID,
    "responsibleMembershipId" UUID,
    "kind" "ethos"."InspectionKind" NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."InspectionReport" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ethos"."ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."MaintenanceRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitId" UUID NOT NULL,
    "leaseId" UUID,
    "assignedMembershipId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "status" "ethos"."MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ethos"."Priority" NOT NULL DEFAULT 'NORMAL',
    "estimatedCost" DECIMAL(18,2),
    "actualCost" DECIMAL(18,2),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Document" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ethos"."DocumentKind" NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "storageProvider" VARCHAR(80) NOT NULL,
    "bucket" VARCHAR(120) NOT NULL,
    "objectKey" VARCHAR(500) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "ownerId" UUID,
    "tenantId" UUID,
    "unitId" UUID,
    "contractVersionId" UUID,
    "receiptId" UUID,
    "inspectionReportId" UUID,
    "maintenanceRequestId" UUID,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Photo" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "inspectionId" UUID,
    "maintenanceRequestId" UUID,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "takenAt" TIMESTAMPTZ(3),

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientMembershipId" UUID NOT NULL,
    "kind" "ethos"."NotificationKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethos"."AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorMembershipId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "databaseRole" VARCHAR(100) NOT NULL,
    "changedFields" JSONB NOT NULL DEFAULT '[]',
    "previousValues" JSONB,
    "currentValues" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "ethos"."Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "ethos"."User"("email");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ethos"."ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_subject_key" ON "ethos"."ExternalIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "ethos"."Permission"("code");

-- CreateIndex
CREATE INDEX "PlatformAccessGrant_userId_idx" ON "ethos"."PlatformAccessGrant"("userId");

-- CreateIndex
CREATE INDEX "PlatformAccessGrant_grantedByUserId_idx" ON "ethos"."PlatformAccessGrant"("grantedByUserId");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_actorUserId_idx" ON "ethos"."PlatformAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_targetUserId_idx" ON "ethos"."PlatformAuditLog"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_id_key" ON "ethos"."OrganizationSettings"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "ethos"."OrganizationSettings"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "ethos"."OrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_idx" ON "ethos"."OrganizationMembership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_id_key" ON "ethos"."OrganizationMembership"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "ethos"."OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "ethos"."Role"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_code_key" ON "ethos"."Role"("organizationId", "code");

-- CreateIndex
CREATE INDEX "MembershipRole_organizationId_roleId_idx" ON "ethos"."MembershipRole"("organizationId", "roleId");

-- CreateIndex
CREATE INDEX "MembershipRole_organizationId_membershipId_idx" ON "ethos"."MembershipRole"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRole_organizationId_id_key" ON "ethos"."MembershipRole"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRole_organizationId_membershipId_roleId_key" ON "ethos"."MembershipRole"("organizationId", "membershipId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "ethos"."RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "RolePermission_organizationId_roleId_idx" ON "ethos"."RolePermission"("organizationId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_organizationId_id_key" ON "ethos"."RolePermission"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_organizationId_roleId_permissionId_key" ON "ethos"."RolePermission"("organizationId", "roleId", "permissionId");

-- CreateIndex
CREATE INDEX "Owner_organizationId_name_idx" ON "ethos"."Owner"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_organizationId_id_key" ON "ethos"."Owner"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_organizationId_taxIdentifier_key" ON "ethos"."Owner"("organizationId", "taxIdentifier");

-- CreateIndex
CREATE INDEX "Tenant_organizationId_name_idx" ON "ethos"."Tenant"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_organizationId_id_key" ON "ethos"."Tenant"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_organizationId_taxIdentifier_key" ON "ethos"."Tenant"("organizationId", "taxIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "Property_organizationId_id_key" ON "ethos"."Property"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Property_organizationId_code_key" ON "ethos"."Property"("organizationId", "code");

-- CreateIndex
CREATE INDEX "PropertyUnit_organizationId_propertyId_idx" ON "ethos"."PropertyUnit"("organizationId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyUnit_organizationId_id_key" ON "ethos"."PropertyUnit"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyUnit_organizationId_propertyId_code_key" ON "ethos"."PropertyUnit"("organizationId", "propertyId", "code");

-- CreateIndex
CREATE INDEX "PropertyOwnership_organizationId_ownerId_idx" ON "ethos"."PropertyOwnership"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "PropertyOwnership_organizationId_propertyId_idx" ON "ethos"."PropertyOwnership"("organizationId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOwnership_organizationId_id_key" ON "ethos"."PropertyOwnership"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOwnership_organizationId_propertyId_ownerId_startsO_key" ON "ethos"."PropertyOwnership"("organizationId", "propertyId", "ownerId", "startsOn");

-- CreateIndex
CREATE INDEX "Lease_organizationId_unitId_status_idx" ON "ethos"."Lease"("organizationId", "unitId", "status");

-- CreateIndex
CREATE INDEX "Lease_organizationId_status_endsOn_idx" ON "ethos"."Lease"("organizationId", "status", "endsOn");

-- CreateIndex
CREATE INDEX "Lease_organizationId_unitId_idx" ON "ethos"."Lease"("organizationId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_organizationId_id_key" ON "ethos"."Lease"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_organizationId_code_key" ON "ethos"."Lease"("organizationId", "code");

-- CreateIndex
CREATE INDEX "LeaseTenant_organizationId_tenantId_idx" ON "ethos"."LeaseTenant"("organizationId", "tenantId");

-- CreateIndex
CREATE INDEX "LeaseTenant_organizationId_leaseId_idx" ON "ethos"."LeaseTenant"("organizationId", "leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseTenant_organizationId_id_key" ON "ethos"."LeaseTenant"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseTenant_organizationId_leaseId_tenantId_startsOn_key" ON "ethos"."LeaseTenant"("organizationId", "leaseId", "tenantId", "startsOn");

-- CreateIndex
CREATE INDEX "Contract_organizationId_leaseId_idx" ON "ethos"."Contract"("organizationId", "leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organizationId_id_key" ON "ethos"."Contract"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organizationId_code_key" ON "ethos"."Contract"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ContractVersion_organizationId_contractId_idx" ON "ethos"."ContractVersion"("organizationId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_organizationId_id_key" ON "ethos"."ContractVersion"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_organizationId_contractId_version_key" ON "ethos"."ContractVersion"("organizationId", "contractId", "version");

-- CreateIndex
CREATE INDEX "LeaseRenewal_organizationId_leaseId_startsOn_idx" ON "ethos"."LeaseRenewal"("organizationId", "leaseId", "startsOn");

-- CreateIndex
CREATE INDEX "LeaseRenewal_organizationId_successorLeaseId_idx" ON "ethos"."LeaseRenewal"("organizationId", "successorLeaseId");

-- CreateIndex
CREATE INDEX "LeaseRenewal_organizationId_leaseId_idx" ON "ethos"."LeaseRenewal"("organizationId", "leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseRenewal_organizationId_id_key" ON "ethos"."LeaseRenewal"("organizationId", "id");

-- CreateIndex
CREATE INDEX "RentAdjustment_organizationId_leaseId_idx" ON "ethos"."RentAdjustment"("organizationId", "leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "RentAdjustment_organizationId_id_key" ON "ethos"."RentAdjustment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RentAdjustment_organizationId_leaseId_effectiveOn_key" ON "ethos"."RentAdjustment"("organizationId", "leaseId", "effectiveOn");

-- CreateIndex
CREATE INDEX "Charge_organizationId_leaseId_competence_idx" ON "ethos"."Charge"("organizationId", "leaseId", "competence");

-- CreateIndex
CREATE INDEX "Charge_organizationId_leaseId_idx" ON "ethos"."Charge"("organizationId", "leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_organizationId_id_key" ON "ethos"."Charge"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_organizationId_code_key" ON "ethos"."Charge"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Installment_organizationId_dueOn_idx" ON "ethos"."Installment"("organizationId", "dueOn");

-- CreateIndex
CREATE INDEX "Installment_organizationId_chargeId_idx" ON "ethos"."Installment"("organizationId", "chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_organizationId_id_key" ON "ethos"."Installment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_organizationId_chargeId_number_key" ON "ethos"."Installment"("organizationId", "chargeId", "number");

-- CreateIndex
CREATE INDEX "Payment_organizationId_leaseId_paidAt_idx" ON "ethos"."Payment"("organizationId", "leaseId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_organizationId_leaseId_idx" ON "ethos"."Payment"("organizationId", "leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_id_key" ON "ethos"."Payment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_code_key" ON "ethos"."Payment"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_externalReference_key" ON "ethos"."Payment"("organizationId", "externalReference");

-- CreateIndex
CREATE INDEX "PaymentAllocation_organizationId_installmentId_idx" ON "ethos"."PaymentAllocation"("organizationId", "installmentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_organizationId_paymentId_idx" ON "ethos"."PaymentAllocation"("organizationId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_organizationId_id_key" ON "ethos"."PaymentAllocation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_organizationId_paymentId_installmentId_key" ON "ethos"."PaymentAllocation"("organizationId", "paymentId", "installmentId");

-- CreateIndex
CREATE INDEX "Receipt_organizationId_paymentId_idx" ON "ethos"."Receipt"("organizationId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_organizationId_id_key" ON "ethos"."Receipt"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_organizationId_number_key" ON "ethos"."Receipt"("organizationId", "number");

-- CreateIndex
CREATE INDEX "Inspection_organizationId_unitId_scheduledAt_idx" ON "ethos"."Inspection"("organizationId", "unitId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Inspection_organizationId_leaseId_idx" ON "ethos"."Inspection"("organizationId", "leaseId");

-- CreateIndex
CREATE INDEX "Inspection_organizationId_responsibleMembershipId_idx" ON "ethos"."Inspection"("organizationId", "responsibleMembershipId");

-- CreateIndex
CREATE INDEX "Inspection_organizationId_unitId_idx" ON "ethos"."Inspection"("organizationId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_organizationId_id_key" ON "ethos"."Inspection"("organizationId", "id");

-- CreateIndex
CREATE INDEX "InspectionReport_organizationId_inspectionId_idx" ON "ethos"."InspectionReport"("organizationId", "inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionReport_organizationId_id_key" ON "ethos"."InspectionReport"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionReport_organizationId_inspectionId_version_key" ON "ethos"."InspectionReport"("organizationId", "inspectionId", "version");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_organizationId_unitId_status_idx" ON "ethos"."MaintenanceRequest"("organizationId", "unitId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_organizationId_leaseId_idx" ON "ethos"."MaintenanceRequest"("organizationId", "leaseId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_organizationId_assignedMembershipId_idx" ON "ethos"."MaintenanceRequest"("organizationId", "assignedMembershipId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_organizationId_unitId_idx" ON "ethos"."MaintenanceRequest"("organizationId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRequest_organizationId_id_key" ON "ethos"."MaintenanceRequest"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Document_organizationId_ownerId_idx" ON "ethos"."Document"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Document_organizationId_tenantId_idx" ON "ethos"."Document"("organizationId", "tenantId");

-- CreateIndex
CREATE INDEX "Document_organizationId_unitId_idx" ON "ethos"."Document"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "Document_organizationId_contractVersionId_idx" ON "ethos"."Document"("organizationId", "contractVersionId");

-- CreateIndex
CREATE INDEX "Document_organizationId_receiptId_idx" ON "ethos"."Document"("organizationId", "receiptId");

-- CreateIndex
CREATE INDEX "Document_organizationId_inspectionReportId_idx" ON "ethos"."Document"("organizationId", "inspectionReportId");

-- CreateIndex
CREATE INDEX "Document_organizationId_maintenanceRequestId_idx" ON "ethos"."Document"("organizationId", "maintenanceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_id_key" ON "ethos"."Document"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_storageProvider_bucket_objectKey_key" ON "ethos"."Document"("organizationId", "storageProvider", "bucket", "objectKey");

-- CreateIndex
CREATE INDEX "Photo_organizationId_unitId_sortOrder_idx" ON "ethos"."Photo"("organizationId", "unitId", "sortOrder");

-- CreateIndex
CREATE INDEX "Photo_organizationId_inspectionId_idx" ON "ethos"."Photo"("organizationId", "inspectionId");

-- CreateIndex
CREATE INDEX "Photo_organizationId_maintenanceRequestId_idx" ON "ethos"."Photo"("organizationId", "maintenanceRequestId");

-- CreateIndex
CREATE INDEX "Photo_organizationId_unitId_idx" ON "ethos"."Photo"("organizationId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_organizationId_id_key" ON "ethos"."Photo"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_organizationId_documentId_key" ON "ethos"."Photo"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientMembershipId_readAt_cr_idx" ON "ethos"."Notification"("organizationId", "recipientMembershipId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientMembershipId_idx" ON "ethos"."Notification"("organizationId", "recipientMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_id_key" ON "ethos"."Notification"("organizationId", "id");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_createdAt_idx" ON "ethos"."AuditLog"("organizationId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_actorMembershipId_idx" ON "ethos"."AuditLog"("organizationId", "actorMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_organizationId_id_key" ON "ethos"."AuditLog"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "ethos"."ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PlatformAccessGrant" ADD CONSTRAINT "PlatformAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PlatformAccessGrant" ADD CONSTRAINT "PlatformAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "ethos"."OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "ethos"."Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."RolePermission" ADD CONSTRAINT "RolePermission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."RolePermission" ADD CONSTRAINT "RolePermission_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "ethos"."Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "ethos"."Permission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Owner" ADD CONSTRAINT "Owner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PropertyUnit" ADD CONSTRAINT "PropertyUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PropertyUnit" ADD CONSTRAINT "PropertyUnit_organizationId_propertyId_fkey" FOREIGN KEY ("organizationId", "propertyId") REFERENCES "ethos"."Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_organizationId_propertyId_fkey" FOREIGN KEY ("organizationId", "propertyId") REFERENCES "ethos"."Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "ethos"."Owner"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Lease" ADD CONSTRAINT "Lease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Lease" ADD CONSTRAINT "Lease_organizationId_unitId_fkey" FOREIGN KEY ("organizationId", "unitId") REFERENCES "ethos"."PropertyUnit"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."LeaseTenant" ADD CONSTRAINT "LeaseTenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."LeaseTenant" ADD CONSTRAINT "LeaseTenant_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."LeaseTenant" ADD CONSTRAINT "LeaseTenant_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "ethos"."Tenant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Contract" ADD CONSTRAINT "Contract_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."ContractVersion" ADD CONSTRAINT "ContractVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."ContractVersion" ADD CONSTRAINT "ContractVersion_organizationId_contractId_fkey" FOREIGN KEY ("organizationId", "contractId") REFERENCES "ethos"."Contract"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_organizationId_successorLeaseId_fkey" FOREIGN KEY ("organizationId", "successorLeaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."RentAdjustment" ADD CONSTRAINT "RentAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."RentAdjustment" ADD CONSTRAINT "RentAdjustment_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Charge" ADD CONSTRAINT "Charge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Charge" ADD CONSTRAINT "Charge_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Installment" ADD CONSTRAINT "Installment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Installment" ADD CONSTRAINT "Installment_organizationId_chargeId_fkey" FOREIGN KEY ("organizationId", "chargeId") REFERENCES "ethos"."Charge"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Payment" ADD CONSTRAINT "Payment_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "ethos"."Payment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_installmentId_fkey" FOREIGN KEY ("organizationId", "installmentId") REFERENCES "ethos"."Installment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Receipt" ADD CONSTRAINT "Receipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Receipt" ADD CONSTRAINT "Receipt_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "ethos"."Payment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Inspection" ADD CONSTRAINT "Inspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Inspection" ADD CONSTRAINT "Inspection_organizationId_unitId_fkey" FOREIGN KEY ("organizationId", "unitId") REFERENCES "ethos"."PropertyUnit"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Inspection" ADD CONSTRAINT "Inspection_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Inspection" ADD CONSTRAINT "Inspection_organizationId_responsibleMembershipId_fkey" FOREIGN KEY ("organizationId", "responsibleMembershipId") REFERENCES "ethos"."OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."InspectionReport" ADD CONSTRAINT "InspectionReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."InspectionReport" ADD CONSTRAINT "InspectionReport_organizationId_inspectionId_fkey" FOREIGN KEY ("organizationId", "inspectionId") REFERENCES "ethos"."Inspection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_organizationId_unitId_fkey" FOREIGN KEY ("organizationId", "unitId") REFERENCES "ethos"."PropertyUnit"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_organizationId_leaseId_fkey" FOREIGN KEY ("organizationId", "leaseId") REFERENCES "ethos"."Lease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_organizationId_assignedMembershipId_fkey" FOREIGN KEY ("organizationId", "assignedMembershipId") REFERENCES "ethos"."OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "ethos"."Owner"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "ethos"."Tenant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_unitId_fkey" FOREIGN KEY ("organizationId", "unitId") REFERENCES "ethos"."PropertyUnit"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_contractVersionId_fkey" FOREIGN KEY ("organizationId", "contractVersionId") REFERENCES "ethos"."ContractVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_receiptId_fkey" FOREIGN KEY ("organizationId", "receiptId") REFERENCES "ethos"."Receipt"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_inspectionReportId_fkey" FOREIGN KEY ("organizationId", "inspectionReportId") REFERENCES "ethos"."InspectionReport"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Document" ADD CONSTRAINT "Document_organizationId_maintenanceRequestId_fkey" FOREIGN KEY ("organizationId", "maintenanceRequestId") REFERENCES "ethos"."MaintenanceRequest"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Photo" ADD CONSTRAINT "Photo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Photo" ADD CONSTRAINT "Photo_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "ethos"."Document"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Photo" ADD CONSTRAINT "Photo_organizationId_unitId_fkey" FOREIGN KEY ("organizationId", "unitId") REFERENCES "ethos"."PropertyUnit"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Photo" ADD CONSTRAINT "Photo_organizationId_inspectionId_fkey" FOREIGN KEY ("organizationId", "inspectionId") REFERENCES "ethos"."Inspection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Photo" ADD CONSTRAINT "Photo_organizationId_maintenanceRequestId_fkey" FOREIGN KEY ("organizationId", "maintenanceRequestId") REFERENCES "ethos"."MaintenanceRequest"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."Notification" ADD CONSTRAINT "Notification_organizationId_recipientMembershipId_fkey" FOREIGN KEY ("organizationId", "recipientMembershipId") REFERENCES "ethos"."OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ethos"."AuditLog" ADD CONSTRAINT "AuditLog_organizationId_actorMembershipId_fkey" FOREIGN KEY ("organizationId", "actorMembershipId") REFERENCES "ethos"."OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Tenant policy: malformed/missing context fails closed.

REVOKE ALL ON SCHEMA ethos FROM PUBLIC;
CREATE FUNCTION ethos.current_organization_id() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  RETURN nullif(current_setting('ethos.organization_id', true), '')::uuid;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END;
$$;
ALTER TABLE ethos."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Organization" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Organization" FOR SELECT USING ("id" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Organization" FOR ALL USING ("id" = ethos.current_organization_id()) WITH CHECK ("id" = ethos.current_organization_id());
ALTER TABLE ethos."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."User" FORCE ROW LEVEL SECURITY;
ALTER TABLE ethos."ExternalIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."ExternalIdentity" FORCE ROW LEVEL SECURITY;
ALTER TABLE ethos."Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Permission" FORCE ROW LEVEL SECURITY;
ALTER TABLE ethos."PlatformAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."PlatformAccessGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE ethos."PlatformAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."PlatformAuditLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE ethos."OrganizationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."OrganizationSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."OrganizationSettings" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."OrganizationSettings" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."OrganizationMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."OrganizationMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."OrganizationMembership" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."OrganizationMembership" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Role" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Role" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."MembershipRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."MembershipRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."MembershipRole" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."MembershipRole" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."RolePermission" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."RolePermission" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Owner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Owner" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Owner" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Owner" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Tenant" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Tenant" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Property" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Property" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Property" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."PropertyUnit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."PropertyUnit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."PropertyUnit" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."PropertyUnit" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."PropertyOwnership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."PropertyOwnership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."PropertyOwnership" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."PropertyOwnership" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Lease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Lease" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Lease" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Lease" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."LeaseTenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."LeaseTenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."LeaseTenant" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."LeaseTenant" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Contract" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Contract" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Contract" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."ContractVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."ContractVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."ContractVersion" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."ContractVersion" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."LeaseRenewal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."LeaseRenewal" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."LeaseRenewal" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."LeaseRenewal" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."RentAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."RentAdjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."RentAdjustment" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."RentAdjustment" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Charge" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Charge" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Charge" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Installment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Installment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Installment" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Installment" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Payment" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Payment" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."PaymentAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."PaymentAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."PaymentAllocation" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."PaymentAllocation" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Receipt" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Receipt" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Inspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Inspection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Inspection" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Inspection" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."InspectionReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."InspectionReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."InspectionReport" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."InspectionReport" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."MaintenanceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."MaintenanceRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."MaintenanceRequest" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."MaintenanceRequest" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Document" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Document" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Photo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Photo" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Photo" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Photo" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."Notification" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_write ON ethos."Notification" FOR ALL USING ("organizationId" = ethos.current_organization_id()) WITH CHECK ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos."AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON ethos."AuditLog" FOR SELECT USING ("organizationId" = ethos.current_organization_id());
ALTER TABLE ethos."User" ADD CONSTRAINT "User_check_1" CHECK ("email" = lower(btrim("email")) AND length("email") > 3);
ALTER TABLE ethos."Role" ADD CONSTRAINT "Role_check_1" CHECK (upper(btrim("code")) <> 'SUPER_ADMIN');
ALTER TABLE ethos."PlatformAccessGrant" ADD CONSTRAINT "PlatformAccessGrant_check_1" CHECK (length(btrim("reason")) > 0);
ALTER TABLE ethos."PlatformAccessGrant" ADD CONSTRAINT "PlatformAccessGrant_check_2" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");
ALTER TABLE ethos."OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_check_1" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE ethos."PropertyUnit" ADD CONSTRAINT "PropertyUnit_check_1" CHECK ("area" IS NULL OR "area" > 0);
ALTER TABLE ethos."PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_check_1" CHECK ("percentage" > 0 AND "percentage" <= 100);
ALTER TABLE ethos."PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_check_2" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");
ALTER TABLE ethos."Lease" ADD CONSTRAINT "Lease_check_1" CHECK ("baseRent" >= 0);
ALTER TABLE ethos."Lease" ADD CONSTRAINT "Lease_check_2" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE ethos."Lease" ADD CONSTRAINT "Lease_check_3" CHECK ("dueDay" BETWEEN 1 AND 31);
ALTER TABLE ethos."Lease" ADD CONSTRAINT "Lease_check_4" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");
ALTER TABLE ethos."Lease" ADD CONSTRAINT "Lease_check_5" CHECK (("status" = 'ENDED') = ("endedAt" IS NOT NULL));
ALTER TABLE ethos."LeaseTenant" ADD CONSTRAINT "LeaseTenant_check_1" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");
ALTER TABLE ethos."ContractVersion" ADD CONSTRAINT "ContractVersion_check_1" CHECK ("version" > 0);
ALTER TABLE ethos."ContractVersion" ADD CONSTRAINT "ContractVersion_check_2" CHECK ("contentHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE ethos."LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_check_1" CHECK ("newRent" >= 0);
ALTER TABLE ethos."LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_check_2" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");
ALTER TABLE ethos."LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_check_3" CHECK ("successorLeaseId" IS NULL OR "successorLeaseId" <> "leaseId");
ALTER TABLE ethos."RentAdjustment" ADD CONSTRAINT "RentAdjustment_check_1" CHECK ("previousRent" >= 0 AND "newRent" >= 0);
ALTER TABLE ethos."RentAdjustment" ADD CONSTRAINT "RentAdjustment_check_2" CHECK ("percentage" >= -100);
ALTER TABLE ethos."RentAdjustment" ADD CONSTRAINT "RentAdjustment_check_3" CHECK (("status" = 'APPLIED') = ("appliedAt" IS NOT NULL));
ALTER TABLE ethos."Charge" ADD CONSTRAINT "Charge_check_1" CHECK ("amount" > 0);
ALTER TABLE ethos."Charge" ADD CONSTRAINT "Charge_check_2" CHECK (extract(day from "competence") = 1);
ALTER TABLE ethos."Installment" ADD CONSTRAINT "Installment_check_1" CHECK ("amount" > 0);
ALTER TABLE ethos."Installment" ADD CONSTRAINT "Installment_check_2" CHECK ("number" > 0);
ALTER TABLE ethos."Payment" ADD CONSTRAINT "Payment_check_1" CHECK ("amount" > 0);
ALTER TABLE ethos."Payment" ADD CONSTRAINT "Payment_check_2" CHECK (("status" = 'REVERSED') = ("reversedAt" IS NOT NULL));
ALTER TABLE ethos."Payment" ADD CONSTRAINT "Payment_check_3" CHECK ("reversedAt" IS NULL OR "reversedAt" >= "paidAt");
ALTER TABLE ethos."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_check_1" CHECK ("amount" > 0);
ALTER TABLE ethos."Receipt" ADD CONSTRAINT "Receipt_check_1" CHECK (("status" = 'VOIDED') = ("voidedAt" IS NOT NULL));
ALTER TABLE ethos."Receipt" ADD CONSTRAINT "Receipt_check_2" CHECK ("status" <> 'VOIDED' OR coalesce(length(btrim("voidReason")),0) > 0);
ALTER TABLE ethos."InspectionReport" ADD CONSTRAINT "InspectionReport_check_1" CHECK ("version" > 0);
ALTER TABLE ethos."InspectionReport" ADD CONSTRAINT "InspectionReport_check_2" CHECK (("status" = 'FINAL') = ("finalizedAt" IS NOT NULL));
ALTER TABLE ethos."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_check_1" CHECK ("estimatedCost" IS NULL OR "estimatedCost" >= 0);
ALTER TABLE ethos."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_check_2" CHECK ("actualCost" IS NULL OR "actualCost" >= 0);
ALTER TABLE ethos."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_check_3" CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));
ALTER TABLE ethos."Document" ADD CONSTRAINT "Document_check_1" CHECK ("sizeBytes" > 0);
ALTER TABLE ethos."Document" ADD CONSTRAINT "Document_check_2" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE ethos."Document" ADD CONSTRAINT "Document_check_3" CHECK (num_nonnulls("ownerId", "tenantId", "unitId", "contractVersionId", "receiptId", "inspectionReportId", "maintenanceRequestId") = 1);
ALTER TABLE ethos."Document" ADD CONSTRAINT "Document_check_4" CHECK ("kind" <> 'PHOTO' OR "unitId" IS NOT NULL);
ALTER TABLE ethos."Photo" ADD CONSTRAINT "Photo_check_1" CHECK ("sortOrder" >= 0);

CREATE UNIQUE INDEX "PropertyUnit_one_main" ON ethos."PropertyUnit" ("organizationId", "propertyId") WHERE "isMain" AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Lease_one_active_unit" ON ethos."Lease" ("organizationId", "unitId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX "Receipt_one_issued_payment" ON ethos."Receipt" ("organizationId", "paymentId") WHERE status = 'ISSUED';
CREATE UNIQUE INDEX "PlatformAccessGrant_one_active" ON ethos."PlatformAccessGrant" ("userId", role) WHERE "revokedAt" IS NULL;

-- No business history is physically deleted; corrections are explicit status changes/new versions.
CREATE FUNCTION ethos.preserve_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='HISTORY_DELETE_FORBIDDEN'; END IF;
  IF to_jsonb(OLD)->>'id' IS DISTINCT FROM to_jsonb(NEW)->>'id'
     OR to_jsonb(OLD)->>'organizationId' IS DISTINCT FROM to_jsonb(NEW)->>'organizationId'
     OR to_jsonb(OLD)->>'createdAt' IS DISTINCT FROM to_jsonb(NEW)->>'createdAt' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='IDENTITY_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME IN ('AuditLog','PlatformAuditLog','PaymentAllocation','ContractVersion','Document') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='HISTORY_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'InspectionReport' THEN
    IF OLD.status::text = 'FINAL' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINAL_REPORT_IMMUTABLE';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'Payment' AND (to_jsonb(OLD) - ARRAY['status','reversedAt']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','reversedAt']) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYMENT_CORE_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'Payment' THEN
    IF NOT (OLD.status::text = NEW.status::text OR (OLD.status::text = 'PENDING' AND NEW.status::text IN ('CONFIRMED','REVERSED')) OR (OLD.status::text = 'CONFIRMED' AND NEW.status::text = 'REVERSED')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYMENT_TRANSITION_INVALID';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'Receipt' THEN
    IF OLD.status::text = 'VOIDED' OR (to_jsonb(OLD) - ARRAY['status','voidedAt','voidReason']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','voidedAt','voidReason']) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='RECEIPT_CORE_IMMUTABLE';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'PlatformAccessGrant' THEN
    IF (to_jsonb(OLD) - 'revokedAt') IS DISTINCT FROM (to_jsonb(NEW) - 'revokedAt') OR OLD."revokedAt" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PLATFORM_GRANT_IMMUTABLE';
    END IF;
  END IF;
  IF TG_TABLE_NAME='Charge' THEN
    IF OLD.status::text <> 'DRAFT' THEN
      IF (to_jsonb(OLD) - 'status') IS DISTINCT FROM (to_jsonb(NEW) - 'status') OR NEW.status::text = 'DRAFT' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ISSUED_CHARGE_IMMUTABLE';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'Lease' AND (to_jsonb(OLD) - ARRAY['status','endedAt']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','endedAt']) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='LEASE_CORE_IMMUTABLE_USE_ADJUSTMENT_OR_RENEWAL';
  END IF;
  IF TG_TABLE_NAME IN ('PropertyUnit','Inspection','MaintenanceRequest','OrganizationMembership','LeaseTenant') THEN
    IF to_jsonb(OLD)->>'unitId' IS DISTINCT FROM to_jsonb(NEW)->>'unitId'
       OR to_jsonb(OLD)->>'propertyId' IS DISTINCT FROM to_jsonb(NEW)->>'propertyId'
       OR to_jsonb(OLD)->>'userId' IS DISTINCT FROM to_jsonb(NEW)->>'userId'
       OR to_jsonb(OLD)->>'tenantId' IS DISTINCT FROM to_jsonb(NEW)->>'tenantId'
       OR to_jsonb(OLD)->>'leaseId' IS DISTINCT FROM to_jsonb(NEW)->>'leaseId' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='HISTORICAL_PARENT_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Organization" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."User" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."ExternalIdentity" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Permission" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."PlatformAccessGrant" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."PlatformAuditLog" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."OrganizationSettings" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."OrganizationMembership" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Role" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."MembershipRole" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."RolePermission" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Owner" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Tenant" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Property" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."PropertyUnit" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."PropertyOwnership" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Lease" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."LeaseTenant" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Contract" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."ContractVersion" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."LeaseRenewal" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."RentAdjustment" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Charge" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Installment" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Payment" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Receipt" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Inspection" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."InspectionReport" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."MaintenanceRequest" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Document" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Photo" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."Notification" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON ethos."AuditLog" FOR EACH ROW EXECUTE FUNCTION ethos.preserve_history();

-- Serializes writes sharing a parent. Deferred validation sees the transaction's final state.
CREATE FUNCTION ethos.lock_parent() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME = 'PropertyOwnership' THEN
    PERFORM 1 FROM ethos."Property" WHERE id = NEW."propertyId" AND "organizationId" = NEW."organizationId" FOR UPDATE;
  ELSIF TG_TABLE_NAME = 'Installment' THEN
    PERFORM 1 FROM ethos."Charge" WHERE id = NEW."chargeId" AND "organizationId" = NEW."organizationId" FOR UPDATE;
    IF TG_OP = 'UPDATE' AND (OLD."chargeId" <> NEW."chargeId" OR EXISTS (SELECT 1 FROM ethos."Charge" WHERE id = OLD."chargeId" AND status <> 'DRAFT')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ISSUED_INSTALLMENT_IMMUTABLE';
    END IF;
  ELSIF TG_TABLE_NAME = 'PaymentAllocation' THEN
    PERFORM 1 FROM ethos."Charge" c JOIN ethos."Installment" i ON i."chargeId"=c.id AND i."organizationId"=c."organizationId"
      WHERE i.id=NEW."installmentId" AND i."organizationId"=NEW."organizationId" FOR UPDATE OF c;
    PERFORM 1 FROM ethos."Installment" WHERE id = NEW."installmentId" AND "organizationId" = NEW."organizationId" FOR UPDATE;
    PERFORM 1 FROM ethos."Payment" WHERE id = NEW."paymentId" AND "organizationId" = NEW."organizationId" FOR UPDATE;
  ELSIF TG_TABLE_NAME = 'Receipt' THEN
    PERFORM 1 FROM ethos."Payment" WHERE id = NEW."paymentId" AND "organizationId" = NEW."organizationId" FOR UPDATE;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lock_parent BEFORE INSERT OR UPDATE ON ethos."PropertyOwnership" FOR EACH ROW EXECUTE FUNCTION ethos.lock_parent();
CREATE TRIGGER lock_parent BEFORE INSERT OR UPDATE ON ethos."Installment" FOR EACH ROW EXECUTE FUNCTION ethos.lock_parent();
CREATE TRIGGER lock_parent BEFORE INSERT ON ethos."PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION ethos.lock_parent();
CREATE TRIGGER lock_parent BEFORE INSERT OR UPDATE ON ethos."Receipt" FOR EACH ROW EXECUTE FUNCTION ethos.lock_parent();

CREATE FUNCTION ethos.validate_ownership() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."propertyId" <> NEW."propertyId" OR OLD."ownerId" <> NEW."ownerId") THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='OWNERSHIP_PARTIES_IMMUTABLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ethos."PropertyOwnership" a JOIN ethos."PropertyOwnership" b
      ON a."organizationId"=b."organizationId" AND a."propertyId"=b."propertyId" AND a."ownerId"=b."ownerId" AND a.id < b.id
    WHERE a."organizationId"=NEW."organizationId" AND a."propertyId"=NEW."propertyId"
      AND daterange(a."startsOn",a."endsOn",'[]') && daterange(b."startsOn",b."endsOn",'[]')
  ) OR EXISTS (
    SELECT 1 FROM (SELECT DISTINCT "organizationId","propertyId","startsOn" FROM ethos."PropertyOwnership") boundary
    JOIN ethos."PropertyOwnership" active ON active."organizationId"=boundary."organizationId" AND active."propertyId"=boundary."propertyId"
      AND active."startsOn" <= boundary."startsOn" AND (active."endsOn" IS NULL OR active."endsOn" >= boundary."startsOn")
    WHERE boundary."organizationId"=NEW."organizationId" AND boundary."propertyId"=NEW."propertyId"
    GROUP BY boundary."startsOn" HAVING sum(active.percentage) > 100
  ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='OWNERSHIP_TOTAL_OR_PERIOD_INVALID'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER validate_ownership AFTER INSERT OR UPDATE ON ethos."PropertyOwnership" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_ownership();

CREATE FUNCTION ethos.validate_charge() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE charge_id uuid; tenant_id uuid; total numeric; expected numeric; charge_status text;
BEGIN
  tenant_id := NEW."organizationId";
  IF TG_TABLE_NAME = 'Charge' THEN charge_id := NEW.id; ELSE charge_id := NEW."chargeId"; END IF;
  SELECT amount,status::text INTO expected,charge_status FROM ethos."Charge" WHERE id=charge_id AND "organizationId"=tenant_id;
  SELECT coalesce(sum(amount),0) INTO total FROM ethos."Installment" WHERE "chargeId"=charge_id AND "organizationId"=tenant_id;
  IF total > expected OR (charge_status='ISSUED' AND total <> expected) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='INSTALLMENT_TOTAL_INVALID';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER validate_charge AFTER INSERT OR UPDATE ON ethos."Charge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_charge();
CREATE CONSTRAINT TRIGGER validate_charge AFTER INSERT OR UPDATE ON ethos."Installment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_charge();

CREATE FUNCTION ethos.validate_finance() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE payment_row ethos."Payment"; charge_row ethos."Charge"; installment_row ethos."Installment";
BEGIN
  IF TG_TABLE_NAME = 'PaymentAllocation' THEN
    SELECT * INTO payment_row FROM ethos."Payment" WHERE id=NEW."paymentId" AND "organizationId"=NEW."organizationId";
    SELECT * INTO installment_row FROM ethos."Installment" WHERE id=NEW."installmentId" AND "organizationId"=NEW."organizationId";
    SELECT * INTO charge_row FROM ethos."Charge" WHERE id=installment_row."chargeId" AND "organizationId"=NEW."organizationId";
    IF payment_row."leaseId" <> charge_row."leaseId" OR payment_row.status <> 'CONFIRMED' OR charge_row.status <> 'ISSUED' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ALLOCATION_RELATION_INVALID';
    END IF;
    IF (SELECT sum(amount) FROM ethos."PaymentAllocation" WHERE "paymentId"=payment_row.id AND "organizationId"=NEW."organizationId") > payment_row.amount
       OR (SELECT coalesce(sum(a.amount),0) FROM ethos."PaymentAllocation" a JOIN ethos."Payment" p ON p.id=a."paymentId" AND p."organizationId"=a."organizationId"
           WHERE a."installmentId"=installment_row.id AND a."organizationId"=NEW."organizationId" AND p.status='CONFIRMED') > installment_row.amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ALLOCATION_TOTAL_INVALID';
    END IF;
  ELSIF TG_TABLE_NAME = 'Receipt' THEN
    SELECT * INTO payment_row FROM ethos."Payment" WHERE id=NEW."paymentId" AND "organizationId"=NEW."organizationId";
    IF NEW.status='ISSUED' AND payment_row.status <> 'CONFIRMED' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='RECEIPT_PAYMENT_NOT_CONFIRMED';
    END IF;
  ELSIF TG_TABLE_NAME = 'Payment' THEN
    IF NEW.status='REVERSED' AND EXISTS (SELECT 1 FROM ethos."Receipt" WHERE "paymentId"=NEW.id AND "organizationId"=NEW."organizationId" AND status='ISSUED') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='VOID_RECEIPT_BEFORE_REVERSAL';
    END IF;
  ELSIF TG_TABLE_NAME = 'Charge' THEN
    IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM ethos."Installment" i JOIN ethos."PaymentAllocation" a ON a."installmentId"=i.id AND a."organizationId"=i."organizationId" JOIN ethos."Payment" p ON p.id=a."paymentId" AND p."organizationId"=a."organizationId"
      WHERE i."chargeId"=NEW.id AND i."organizationId"=NEW."organizationId" AND p.status='CONFIRMED') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='REVERSE_PAYMENTS_BEFORE_CANCELLATION';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER validate_finance AFTER INSERT ON ethos."PaymentAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_finance();
CREATE CONSTRAINT TRIGGER validate_finance AFTER INSERT OR UPDATE ON ethos."Receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_finance();
CREATE CONSTRAINT TRIGGER validate_finance AFTER UPDATE ON ethos."Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_finance();
CREATE CONSTRAINT TRIGGER validate_finance AFTER UPDATE ON ethos."Charge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ethos.validate_finance();

CREATE FUNCTION ethos.validate_unit_links() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME IN ('Inspection','MaintenanceRequest') THEN
    IF NEW."leaseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ethos."Lease" WHERE id=NEW."leaseId" AND "organizationId"=NEW."organizationId" AND "unitId"=NEW."unitId") THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='LEASE_UNIT_MISMATCH';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM ethos."Document" WHERE id=NEW."documentId" AND "organizationId"=NEW."organizationId" AND kind='PHOTO' AND "unitId"=NEW."unitId")
      OR (NEW."inspectionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ethos."Inspection" WHERE id=NEW."inspectionId" AND "organizationId"=NEW."organizationId" AND "unitId"=NEW."unitId"))
      OR (NEW."maintenanceRequestId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ethos."MaintenanceRequest" WHERE id=NEW."maintenanceRequestId" AND "organizationId"=NEW."organizationId" AND "unitId"=NEW."unitId")) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PHOTO_UNIT_OR_DOCUMENT_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_unit_links BEFORE INSERT OR UPDATE ON ethos."Inspection" FOR EACH ROW EXECUTE FUNCTION ethos.validate_unit_links();
CREATE TRIGGER validate_unit_links BEFORE INSERT OR UPDATE ON ethos."MaintenanceRequest" FOR EACH ROW EXECUTE FUNCTION ethos.validate_unit_links();
CREATE TRIGGER validate_unit_links BEFORE INSERT OR UPDATE ON ethos."Photo" FOR EACH ROW EXECUTE FUNCTION ethos.validate_unit_links();

-- Trigger-only definer: owner must be the privileged migration role; no callable bypass API.
CREATE FUNCTION ethos.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE row_data jsonb; old_data jsonb; actor uuid; changed jsonb; db_role text; platform_actor uuid; operation_reason text;
BEGIN
  row_data := to_jsonb(NEW);
  old_data := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  db_role := CASE WHEN current_setting('role',true) IN ('none','') THEN session_user ELSE current_setting('role',true) END;
  IF TG_TABLE_NAME = 'PlatformAccessGrant' THEN
    IF TG_OP='UPDATE' THEN
      platform_actor := nullif(current_setting('ethos.platform_actor_user_id',true),'')::uuid;
      operation_reason := nullif(btrim(current_setting('ethos.platform_operation_reason',true)),'');
      IF platform_actor IS NULL OR operation_reason IS NULL OR NOT EXISTS (SELECT 1 FROM ethos."User" WHERE id=platform_actor AND "disabledAt" IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PLATFORM_REVOCATION_CONTEXT_REQUIRED';
      END IF;
    ELSE
      platform_actor := NEW."grantedByUserId";
      operation_reason := NEW.reason;
    END IF;
    INSERT INTO ethos."PlatformAuditLog" (id,"actorUserId","targetUserId",action,reason,"databaseRole")
    VALUES (gen_random_uuid(),platform_actor,NEW."userId",CASE WHEN TG_OP='INSERT' THEN 'GRANT' ELSE 'REVOKE' END,operation_reason,db_role);
  ELSE
    BEGIN actor := nullif(current_setting('ethos.actor_membership_id',true),'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='AUDIT_ACTOR_INVALID'; END;
    IF actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ethos."OrganizationMembership" WHERE id=actor AND "organizationId"=NEW."organizationId" AND status='ACTIVE') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='AUDIT_ACTOR_INVALID';
    END IF;
    SELECT coalesce(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO changed FROM jsonb_each(row_data) WHERE value IS DISTINCT FROM old_data->key;
    INSERT INTO ethos."AuditLog" (id,"organizationId","actorMembershipId",action,"entityType","entityId","databaseRole","changedFields","previousValues","currentValues")
    VALUES (gen_random_uuid(),NEW."organizationId",actor,TG_OP,TG_TABLE_NAME,NEW.id,db_role,changed,nullif(old_data,'{}'::jsonb),row_data);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ethos.audit_change() FROM PUBLIC;
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."PlatformAccessGrant" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."OrganizationSettings" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."OrganizationMembership" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Role" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."MembershipRole" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."RolePermission" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Owner" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Tenant" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Property" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."PropertyUnit" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."PropertyOwnership" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Lease" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."LeaseTenant" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Contract" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."ContractVersion" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."LeaseRenewal" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."RentAdjustment" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Charge" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Installment" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Payment" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Receipt" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Inspection" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."InspectionReport" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."MaintenanceRequest" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Document" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Photo" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON ethos."Notification" FOR EACH ROW EXECUTE FUNCTION ethos.audit_change();
REVOKE ALL ON FUNCTION ethos.preserve_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION ethos.lock_parent() FROM PUBLIC;
REVOKE ALL ON FUNCTION ethos.validate_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION ethos.validate_charge() FROM PUBLIC;
REVOKE ALL ON FUNCTION ethos.validate_finance() FROM PUBLIC;
REVOKE ALL ON FUNCTION ethos.validate_unit_links() FROM PUBLIC;

COMMIT;
