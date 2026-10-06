-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PROPOSAL', 'CONTRACT', 'CERTIFICATION', 'COMPLIANCE', 'TEMPLATE', 'OTHER', 'SOLICITATION', 'AMENDMENT', 'CAPABILITY_STATEMENT', 'PAST_PERFORMANCE');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SecurityClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('DOCUMENT_UPLOADED', 'EMAIL_SENT', 'MEETING_SCHEDULED', 'NOTE_ADDED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('AI_QUERY', 'DOCUMENT_PROCESSING', 'API_CALL', 'EXPORT', 'USER_SEAT', 'AI_REQUESTS');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('REQUESTED', 'SOFT_DELETED', 'SCHEDULED', 'HARD_DELETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeletionType" AS ENUM ('USER_INITIATED', 'ADMIN_INITIATED', 'COMPLIANCE_REQUIRED', 'SECURITY_INCIDENT', 'ACCOUNT_CLOSURE');

-- CreateEnum
CREATE TYPE "DeletionAction" AS ENUM ('REQUEST_CREATED', 'SUBSCRIPTIONS_CANCELLED', 'STRIPE_CUSTOMER_PROCESSED', 'CLERK_USER_DELETED', 'PII_ANONYMIZED', 'DATA_SOFT_DELETED', 'DATA_HARD_DELETED', 'AUDIT_CREATED', 'DELETION_COMPLETED', 'DELETION_FAILED', 'DELETION_CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'UPDATE', 'WARNING', 'SUCCESS', 'BILLING', 'TEAM');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SYSTEM_UPDATE', 'BILLING', 'TEAM', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationFrequency" AS ENUM ('REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'MFA_ENABLED', 'MFA_DISABLED', 'MFA_CHALLENGE_FAILED', 'SESSION_EXPIRED', 'SESSION_TERMINATED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_ROLE_CHANGED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'USER_INVITED', 'USER_INVITATION_ACCEPTED', 'USER_INVITATION_EXPIRED', 'ORGANIZATION_CREATED', 'ORGANIZATION_UPDATED', 'ORGANIZATION_DELETED', 'ORGANIZATION_SETTINGS_CHANGED', 'ORGANIZATION_MEMBER_ADDED', 'ORGANIZATION_MEMBER_REMOVED', 'ORGANIZATION_PLAN_CHANGED', 'ORGANIZATION_SUSPENDED', 'ORGANIZATION_REACTIVATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_PROCESSED', 'DOCUMENT_PROCESSING_FAILED', 'DOCUMENT_DELETED', 'DOCUMENT_SHARED', 'DOCUMENT_DOWNLOADED', 'DOCUMENT_VECTORIZED', 'DOCUMENT_CHUNK_CREATED', 'DOCUMENT_OCR_PROCESSED', 'DOCUMENT_MOVED_TO_FOLDER', 'DOCUMENT_VERSION_CREATED', 'DOCUMENT_EXPORTED', 'AI_REQUEST_INITIATED', 'AI_REQUEST_COMPLETED', 'AI_REQUEST_FAILED', 'AI_PROVIDER_SWITCHED', 'AI_COST_CALCULATED', 'AI_USAGE_TRACKED', 'AI_MODEL_SELECTED', 'AI_FALLBACK_TRIGGERED', 'AI_CIRCUIT_BREAKER_OPENED', 'AI_CIRCUIT_BREAKER_CLOSED', 'AI_RATE_LIMIT_EXCEEDED', 'AI_BUDGET_EXCEEDED', 'AI_OPTIMIZATION_APPLIED', 'CHAT_SESSION_STARTED', 'CHAT_SESSION_ENDED', 'CHAT_MESSAGE_SENT', 'CHAT_RESPONSE_GENERATED', 'CHAT_CONTEXT_RETRIEVED', 'CHAT_CITATION_GENERATED', 'CHAT_FEEDBACK_PROVIDED', 'CHAT_CONVERSATION_EXPORTED', 'CHAT_HISTORY_CLEARED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_REACTIVATED', 'SUBSCRIPTION_UPGRADED', 'SUBSCRIPTION_DOWNGRADED', 'PAYMENT_PROCESSED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'INVOICE_GENERATED', 'USAGE_LIMIT_REACHED', 'USAGE_LIMIT_EXCEEDED', 'BILLING_WEBHOOK_RECEIVED', 'NOTIFICATION_CREATED', 'NOTIFICATION_SENT', 'NOTIFICATION_READ', 'NOTIFICATION_DISMISSED', 'NOTIFICATION_PREFERENCES_UPDATED', 'NOTIFICATION_BATCH_SENT', 'NOTIFICATION_FAILED', 'NOTIFICATION_EXPIRED', 'API_KEY_CREATED', 'API_KEY_USED', 'API_KEY_REVOKED', 'API_KEY_EXPIRED', 'API_REQUEST_MADE', 'API_REQUEST_FAILED', 'API_RATE_LIMIT_HIT', 'API_ENDPOINT_ACCESSED', 'API_AUTHENTICATION_FAILED', 'SECURITY_ALERT_TRIGGERED', 'SECURITY_INCIDENT_CREATED', 'SECURITY_INCIDENT_RESOLVED', 'UNAUTHORIZED_ACCESS_ATTEMPTED', 'PRIVILEGE_ESCALATION_DETECTED', 'SUSPICIOUS_ACTIVITY_DETECTED', 'COMPLIANCE_VIOLATION_DETECTED', 'COMPLIANCE_REPORT_GENERATED', 'AUDIT_LOG_ACCESSED', 'AUDIT_LOG_EXPORTED', 'DATA_BREACH_DETECTED', 'VULNERABILITY_DETECTED', 'SECURITY_SCAN_COMPLETED', 'SECURITY_VIOLATION', 'SYSTEM_STARTUP', 'SYSTEM_SHUTDOWN', 'SYSTEM_MAINTENANCE_STARTED', 'SYSTEM_MAINTENANCE_COMPLETED', 'CONFIGURATION_CHANGED', 'FEATURE_FLAG_UPDATED', 'CACHE_CLEARED', 'CACHE_WARMED', 'BACKUP_CREATED', 'BACKUP_RESTORED', 'DATABASE_MIGRATION_STARTED', 'DATABASE_MIGRATION_COMPLETED');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('AUTHENTICATION', 'AUTHORIZATION', 'DATA_ACCESS', 'DATA_MODIFICATION', 'USER_MANAGEMENT', 'ORGANIZATION_MANAGEMENT', 'PROFILE_MANAGEMENT', 'DOCUMENT_MANAGEMENT', 'AI_SERVICES', 'BILLING', 'NOTIFICATIONS', 'API_USAGE', 'SECURITY', 'COMPLIANCE', 'AUDIT_MANAGEMENT', 'SYSTEM_ADMINISTRATION', 'ERROR', 'BUSINESS_LOGIC');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('JSON', 'CSV', 'XML', 'PDF');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SecurityIncidentType" AS ENUM ('UNAUTHORIZED_ACCESS', 'DATA_BREACH', 'MALWARE', 'PHISHING', 'INSIDER_THREAT', 'SYSTEM_COMPROMISE', 'DENIAL_OF_SERVICE', 'PRIVILEGE_ESCALATION', 'DATA_LOSS', 'COMPLIANCE_VIOLATION', 'SUSPICIOUS_ACTIVITY', 'CONFIGURATION_ERROR', 'VULNERABILITY_EXPLOIT');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SecurityIncidentStatus" AS ENUM ('DETECTED', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE', 'ESCALATED');

-- CreateEnum
CREATE TYPE "BrandVoice" AS ENUM ('PROFESSIONAL', 'FRIENDLY', 'TECHNICAL', 'AUTHORITATIVE', 'CREATIVE', 'COLLABORATIVE');

-- CreateEnum
CREATE TYPE "BrandTone" AS ENUM ('FORMAL', 'CONVERSATIONAL', 'DIRECT', 'COLLABORATIVE', 'CONSULTATIVE', 'RESULTS_DRIVEN');

-- CreateEnum
CREATE TYPE "OrganizationLevel" AS ENUM ('FEDERAL', 'STATE', 'LOCAL', 'MUNICIPAL', 'COUNTY', 'ENTERPRISE', 'DEPARTMENT');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "planType" TEXT,
    "billingEmail" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "timezone" TEXT,
    "emailOptIn" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "path" TEXT[],
    "level" INTEGER NOT NULL DEFAULT 0,
    "isSystemFolder" BOOLEAN NOT NULL DEFAULT false,
    "folderType" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "securityClassification" "SecurityClassification" NOT NULL DEFAULT 'PUBLIC',
    "workflowStatus" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "extractedText" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "tags" TEXT[],
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL,
    "embeddings" JSONB NOT NULL,
    "entities" JSONB NOT NULL,
    "sharing" JSONB NOT NULL,
    "revisions" JSONB NOT NULL,
    "processing" JSONB NOT NULL,
    "analysis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "interval" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageType" "UsageType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "metadata" JSONB,
    "reportedToStripe" BOOLEAN NOT NULL DEFAULT false,
    "stripeUsageRecordId" TEXT,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "processingError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "metadata" JSONB,
    "responseTime" INTEGER,
    "statusCode" INTEGER,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "type" "NotificationType" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_user_statuses" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notification_user_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "NotificationFrequency" NOT NULL DEFAULT 'REAL_TIME',
    "digestTime" TEXT,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "DeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "deletionType" "DeletionType" NOT NULL DEFAULT 'USER_INITIATED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "softDeletedAt" TIMESTAMP(3),
    "hardDeletedAt" TIMESTAMP(3),
    "scheduledHardDeleteAt" TIMESTAMP(3),
    "requestedBy" TEXT NOT NULL,
    "requestedByEmail" TEXT,
    "retainedData" JSONB,
    "deletedData" JSONB,
    "clerkUserDeleted" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerProcessed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_audits" (
    "id" TEXT NOT NULL,
    "accountDeletionId" TEXT NOT NULL,
    "action" "DeletionAction" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "dataType" TEXT NOT NULL,
    "recordsAffected" INTEGER,
    "details" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,

    CONSTRAINT "account_deletion_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_migrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "oldSubscriptionId" TEXT NOT NULL,
    "newSubscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordsMigrated" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "preservedOriginal" BOOLEAN NOT NULL DEFAULT false,
    "migratedBy" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "usage_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "monthlyPrice" INTEGER NOT NULL,
    "yearlyPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeMonthlyPriceId" TEXT,
    "stripeYearlyPriceId" TEXT,
    "features" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "targetAudience" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_test_variants" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_test_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_test_results" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "latency" INTEGER NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "userFeedback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_metrics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "latency" INTEGER NOT NULL,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "totalTokens" INTEGER,
    "cost" DOUBLE PRECISION NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "routingDecision" TEXT,
    "routingReason" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "errorType" TEXT,
    "responseQuality" DOUBLE PRECISION,
    "userFeedback" JSONB,
    "metadata" JSONB,

    CONSTRAINT "ai_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_status" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isHealthy" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthCheck" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "avgLatency" DOUBLE PRECISION,
    "p95Latency" DOUBLE PRECISION,
    "successRate" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "circuitState" TEXT NOT NULL DEFAULT 'CLOSED',
    "circuitOpenedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "costMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "ai_provider_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_routing_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'BALANCED',
    "preferredProviders" TEXT[],
    "blockedProviders" TEXT[],
    "maxCostPerRequest" DOUBLE PRECISION,
    "monthlyCostLimit" DOUBLE PRECISION,
    "costAlertThreshold" DOUBLE PRECISION,
    "maxLatency" INTEGER,
    "minQualityScore" DOUBLE PRECISION,
    "enableFallback" BOOLEAN NOT NULL DEFAULT true,
    "maxFallbackAttempts" INTEGER NOT NULL DEFAULT 2,
    "fallbackDelay" INTEGER NOT NULL DEFAULT 100,
    "abTestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "abTestPercentage" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "ai_routing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cost_optimizations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" TEXT NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "projectedCost" DOUBLE PRECISION NOT NULL,
    "targetCost" DOUBLE PRECISION,
    "costSavings" DOUBLE PRECISION NOT NULL,
    "providerCosts" JSONB NOT NULL,
    "modelCosts" JSONB NOT NULL,
    "operationCosts" JSONB NOT NULL,
    "cacheHitRate" DOUBLE PRECISION NOT NULL,
    "routingEfficiency" DOUBLE PRECISION NOT NULL,
    "tokenEfficiency" DOUBLE PRECISION NOT NULL,
    "recommendations" JSONB[],
    "appliedOptimizations" JSONB[],

    CONSTRAINT "ai_cost_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "provider" TEXT,
    "metric" TEXT,
    "threshold" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION,
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "actionTaken" TEXT,
    "actionBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ai_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_processing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "totalDocuments" INTEGER NOT NULL,
    "processedDocuments" INTEGER NOT NULL DEFAULT 0,
    "failedDocuments" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "batch_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" "AuditEventType" NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "sessionId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "endpoint" TEXT,
    "httpMethod" TEXT,
    "statusCode" INTEGER,
    "message" TEXT NOT NULL,
    "description" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    "retentionPeriod" TEXT NOT NULL DEFAULT '7_YEARS',
    "complianceFlag" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "duration" INTEGER,
    "errorMessage" TEXT,
    "stackTrace" TEXT,
    "checksum" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "dataLocation" TEXT,
    "jurisdiction" TEXT,
    "parentLogId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_retention" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyName" TEXT NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "archiveAfter" INTEGER,
    "complianceFramework" TEXT[],
    "legalBasis" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoDelete" BOOLEAN NOT NULL DEFAULT false,
    "archiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "audit_log_retention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_exports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "categories" "AuditCategory"[],
    "eventTypes" "AuditEventType"[],
    "format" "ExportFormat" NOT NULL DEFAULT 'JSON',
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalRecords" INTEGER,
    "exportedRecords" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "downloadUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "checksum" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "accessedBy" TEXT[],
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "purpose" TEXT,
    "approvedBy" TEXT,

    CONSTRAINT "audit_log_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "incidentType" "SecurityIncidentType" NOT NULL,
    "severity" "SecuritySeverity" NOT NULL,
    "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "affectedSystems" TEXT[],
    "investigatedBy" TEXT[],
    "responseActions" JSONB,
    "rootCause" TEXT,
    "lessons" TEXT,
    "dataCompromised" BOOLEAN NOT NULL DEFAULT false,
    "usersAffected" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(65,30),
    "reportedToAuthorities" BOOLEAN NOT NULL DEFAULT false,
    "regulatoryReporting" JSONB,
    "relatedLogIds" TEXT[],
    "tags" TEXT[],
    "attachments" JSONB,

    CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "companyName" TEXT NOT NULL,
    "dbaName" TEXT,
    "uei" TEXT,
    "duns" TEXT,
    "cageCode" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'USA',
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "contactProfileImageUrl" TEXT,
    "businessType" TEXT,
    "yearEstablished" INTEGER,
    "employeeCount" TEXT,
    "annualRevenue" TEXT,
    "primaryNaics" TEXT,
    "secondaryNaics" TEXT[],
    "certifications" JSONB,
    "coreCompetencies" TEXT[],
    "competencyDetails" JSONB,
    "pastPerformance" JSONB,
    "securityClearance" TEXT,
    "brandVoice" "BrandVoice",
    "brandTone" "BrandTone",
    "geographicPreferences" JSONB,
    "organizationLevels" "OrganizationLevel"[],
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "samGovSyncedAt" TIMESTAMP(3),
    "samGovData" JSONB,
    "profileEmbeddings" JSONB,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "folders_organizationId_parentId_idx" ON "folders"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "folders_organizationId_isSystemFolder_idx" ON "folders"("organizationId", "isSystemFolder");

-- CreateIndex
CREATE INDEX "folders_path_idx" ON "folders"("path");

-- CreateIndex
CREATE INDEX "documents_organizationId_uploadedById_idx" ON "documents"("organizationId", "uploadedById");

-- CreateIndex
CREATE INDEX "documents_organizationId_folderId_idx" ON "documents"("organizationId", "folderId");

-- CreateIndex
CREATE INDEX "documents_organizationId_createdAt_idx" ON "documents"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_organizationId_documentType_createdAt_idx" ON "documents"("organizationId", "documentType", "createdAt");

-- CreateIndex
CREATE INDEX "documents_organizationId_workflowStatus_idx" ON "documents"("organizationId", "workflowStatus");

-- CreateIndex
CREATE INDEX "documents_uploadedById_createdAt_idx" ON "documents"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "documents_documentType_idx" ON "documents"("documentType");

-- CreateIndex
CREATE INDEX "documents_workflowStatus_idx" ON "documents"("workflowStatus");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_usageType_periodStart_idx" ON "usage_records"("organizationId", "usageType", "periodStart");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_createdAt_idx" ON "usage_records"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_stripeEventId_key" ON "billing_events"("stripeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyId_key" ON "api_keys"("keyId");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "api_keys_keyId_idx" ON "api_keys"("keyId");

-- CreateIndex
CREATE INDEX "usage_events_organizationId_type_createdAt_idx" ON "usage_events"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "usage_events_organizationId_createdAt_idx" ON "usage_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_userId_idx" ON "notifications"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_createdAt_idx" ON "notifications"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notification_user_statuses_userId_isRead_isDeleted_idx" ON "notification_user_statuses"("userId", "isRead", "isDeleted");

-- CreateIndex
CREATE INDEX "notification_user_statuses_notificationId_idx" ON "notification_user_statuses"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_user_statuses_notificationId_userId_key" ON "notification_user_statuses"("notificationId", "userId");

-- CreateIndex
CREATE INDEX "notification_preferences_userId_organizationId_idx" ON "notification_preferences"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_category_key" ON "notification_preferences"("userId", "category");

-- CreateIndex
CREATE INDEX "usage_migrations_organizationId_createdAt_idx" ON "usage_migrations"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_migrations_oldSubscriptionId_idx" ON "usage_migrations"("oldSubscriptionId");

-- CreateIndex
CREATE INDEX "usage_migrations_newSubscriptionId_idx" ON "usage_migrations"("newSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_plans_planType_key" ON "pricing_plans"("planType");

-- CreateIndex
CREATE INDEX "pricing_plans_planType_idx" ON "pricing_plans"("planType");

-- CreateIndex
CREATE INDEX "pricing_plans_isActive_displayOrder_idx" ON "pricing_plans"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "organization_settings_organizationId_idx" ON "organization_settings"("organizationId");

-- CreateIndex
CREATE INDEX "organization_settings_category_idx" ON "organization_settings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organizationId_category_key" ON "organization_settings"("organizationId", "category");

-- CreateIndex
CREATE INDEX "ab_tests_enabled_startDate_idx" ON "ab_tests"("enabled", "startDate");

-- CreateIndex
CREATE INDEX "ab_tests_endDate_idx" ON "ab_tests"("endDate");

-- CreateIndex
CREATE INDEX "ab_test_variants_testId_idx" ON "ab_test_variants"("testId");

-- CreateIndex
CREATE INDEX "ab_test_results_testId_variantId_idx" ON "ab_test_results"("testId", "variantId");

-- CreateIndex
CREATE INDEX "ab_test_results_userId_organizationId_idx" ON "ab_test_results"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "ab_test_results_startTime_idx" ON "ab_test_results"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "ai_metrics_requestId_key" ON "ai_metrics"("requestId");

-- CreateIndex
CREATE INDEX "ai_metrics_organizationId_createdAt_idx" ON "ai_metrics"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_metrics_organizationId_provider_createdAt_idx" ON "ai_metrics"("organizationId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "ai_metrics_organizationId_operation_createdAt_idx" ON "ai_metrics"("organizationId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "ai_metrics_provider_model_createdAt_idx" ON "ai_metrics"("provider", "model", "createdAt");

-- CreateIndex
CREATE INDEX "ai_metrics_provider_model_success_createdAt_idx" ON "ai_metrics"("provider", "model", "success", "createdAt");

-- CreateIndex
CREATE INDEX "ai_metrics_requestId_idx" ON "ai_metrics"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_status_provider_key" ON "ai_provider_status"("provider");

-- CreateIndex
CREATE INDEX "ai_provider_status_provider_idx" ON "ai_provider_status"("provider");

-- CreateIndex
CREATE INDEX "ai_provider_status_isHealthy_priority_idx" ON "ai_provider_status"("isHealthy", "priority");

-- CreateIndex
CREATE INDEX "ai_routing_configs_organizationId_idx" ON "ai_routing_configs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_routing_configs_organizationId_key" ON "ai_routing_configs"("organizationId");

-- CreateIndex
CREATE INDEX "ai_cost_optimizations_organizationId_periodStart_idx" ON "ai_cost_optimizations"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "ai_cost_optimizations_organizationId_periodType_periodStart_idx" ON "ai_cost_optimizations"("organizationId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "ai_alerts_organizationId_createdAt_idx" ON "ai_alerts"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_alerts_organizationId_alertType_severity_idx" ON "ai_alerts"("organizationId", "alertType", "severity");

-- CreateIndex
CREATE INDEX "ai_alerts_severity_acknowledgedAt_idx" ON "ai_alerts"("severity", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "batch_processing_organizationId_status_idx" ON "batch_processing"("organizationId", "status");

-- CreateIndex
CREATE INDEX "batch_processing_userId_createdAt_idx" ON "batch_processing"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_eventType_createdAt_idx" ON "audit_logs"("organizationId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_category_createdAt_idx" ON "audit_logs"("organizationId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_eventType_severity_createdAt_idx" ON "audit_logs"("eventType", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_sessionId_createdAt_idx" ON "audit_logs"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_complianceFlag_createdAt_idx" ON "audit_logs"("complianceFlag", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_retentionPeriod_createdAt_idx" ON "audit_logs"("retentionPeriod", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_checksum_idx" ON "audit_logs"("checksum");

-- CreateIndex
CREATE INDEX "audit_log_retention_organizationId_isActive_idx" ON "audit_log_retention"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "audit_log_retention_category_retentionDays_idx" ON "audit_log_retention"("category", "retentionDays");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_retention_organizationId_category_key" ON "audit_log_retention"("organizationId", "category");

-- CreateIndex
CREATE INDEX "audit_log_exports_organizationId_createdAt_idx" ON "audit_log_exports"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_exports_organizationId_status_idx" ON "audit_log_exports"("organizationId", "status");

-- CreateIndex
CREATE INDEX "audit_log_exports_userId_createdAt_idx" ON "audit_log_exports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_exports_status_createdAt_idx" ON "audit_log_exports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_exports_expiresAt_idx" ON "audit_log_exports"("expiresAt");

-- CreateIndex
CREATE INDEX "security_incidents_organizationId_detectedAt_idx" ON "security_incidents"("organizationId", "detectedAt");

-- CreateIndex
CREATE INDEX "security_incidents_organizationId_incidentType_severity_idx" ON "security_incidents"("organizationId", "incidentType", "severity");

-- CreateIndex
CREATE INDEX "security_incidents_status_detectedAt_idx" ON "security_incidents"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "security_incidents_severity_status_idx" ON "security_incidents"("severity", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_user_statuses" ADD CONSTRAINT "notification_user_statuses_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_user_statuses" ADD CONSTRAINT "notification_user_statuses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_audits" ADD CONSTRAINT "account_deletion_audits_accountDeletionId_fkey" FOREIGN KEY ("accountDeletionId") REFERENCES "account_deletions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_migrations" ADD CONSTRAINT "usage_migrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_migrations" ADD CONSTRAINT "usage_migrations_oldSubscriptionId_fkey" FOREIGN KEY ("oldSubscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_migrations" ADD CONSTRAINT "usage_migrations_newSubscriptionId_fkey" FOREIGN KEY ("newSubscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_variants" ADD CONSTRAINT "ab_test_variants_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ab_test_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_metrics" ADD CONSTRAINT "ai_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_routing_configs" ADD CONSTRAINT "ai_routing_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_cost_optimizations" ADD CONSTRAINT "ai_cost_optimizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_alerts" ADD CONSTRAINT "ai_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_processing" ADD CONSTRAINT "batch_processing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_processing" ADD CONSTRAINT "batch_processing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_parentLogId_fkey" FOREIGN KEY ("parentLogId") REFERENCES "audit_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_retention" ADD CONSTRAINT "audit_log_retention_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_exports" ADD CONSTRAINT "audit_log_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_exports" ADD CONSTRAINT "audit_log_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Clerk authorization is enforced in tenant-scoped server routes using Prisma.
-- Browser Supabase roles must not read or mutate the application's server tables.
DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ab_test_results', 'ab_test_variants', 'ab_tests', 'account_deletion_audits', 'account_deletions', 'activities', 'ai_alerts', 'ai_cost_optimizations', 'ai_metrics', 'ai_provider_status', 'ai_routing_configs', 'api_keys', 'audit_log_exports', 'audit_log_retention', 'audit_logs', 'batch_processing', 'billing_events', 'conversations', 'documents', 'folders', 'notification_preferences', 'notification_user_statuses', 'notifications', 'organization_settings', 'organizations', 'pricing_plans', 'profiles', 'saved_searches', 'security_incidents', 'subscriptions', 'usage_events', 'usage_migrations', 'usage_records', 'users']
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
