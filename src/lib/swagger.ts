/**
 * OpenAPI/Swagger Configuration for Document Chat System AI API
 *
 * This file configures the API documentation generation using swagger-jsdoc
 * and provides the base OpenAPI specification for all API endpoints.
 */

import swaggerJSDoc from 'swagger-jsdoc'
import { app, contact } from '@/lib/config/env';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Document Chat System AI API',
      version: '1.0.0',
      description: `
# Document Chat System AI API Documentation

A comprehensive SaaS platform that revolutionizes government contracting through AI-powered insights.
The platform leverages multiple AI providers to provide opportunity discovery, intelligent matching,
and document processing for government contractors.

## Features

- **Opportunity Discovery**: Search and filter government contracting opportunities
- **AI-Powered Matching**: Intelligent match scoring based on company profiles
- **Profile Management**: Comprehensive contractor profile management
- **Authentication**: Secure authentication and authorization
- **Multi-tenancy**: Organization-based data isolation

## Authentication

All API endpoints require authentication. The API uses Clerk for authentication management.
Include your authentication token in the Authorization header:

\`\`\`
Authorization: Bearer <your-token>
\`\`\`

## Rate Limiting

API endpoints are rate-limited to ensure fair usage:
- General endpoints: 100 requests per 15 minutes
- Search endpoints: 50 requests per 15 minutes
- AI endpoints: 20 requests per 15 minutes

## Error Handling

The API uses standard HTTP status codes and returns consistent error responses:

\`\`\`json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": [
    {
      "field": "fieldName",
      "message": "Validation error message",
      "code": "validation_code"
    }
  ]
}
\`\`\`

## Data Formats

- **Dates**: ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
- **Currency**: Numbers in USD cents (e.g., 100000 = $1,000.00)
- **IDs**: UUIDs or Clerk IDs where applicable
      `,
      contact: {
        name: contact.supportName,
        email: contact.supportEmail
      },
      license: {
        name: 'Proprietary',
        url: 'https://document-chat-system.vercel.app/license'
      }
    },
    servers: [
      {
        url: app.url,
        description: app.nodeEnv === 'production'
          ? 'Production server'
          : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Clerk authentication token'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
              description: 'Always false for error responses'
            },
            error: {
              type: 'string',
              description: 'Human-readable error message'
            },
            code: {
              type: 'string',
              description: 'Machine-readable error code'
            },
            details: {
              type: 'array',
              description: 'Additional error details (e.g., validation errors)',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  code: { type: 'string' }
                }
              }
            }
          }
        },
        ValidationError: {
          allOf: [
            { $ref: '#/components/schemas/Error' },
            {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  enum: ['VALIDATION_ERROR']
                }
              }
            }
          ]
        },
        AuthenticationError: {
          allOf: [
            { $ref: '#/components/schemas/Error' },
            {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  enum: ['AUTHENTICATION_ERROR']
                }
              }
            }
          ]
        },
        Opportunity: {
          type: 'object',
          required: ['id', 'title', 'description', 'agency', 'postedDate'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique opportunity identifier'
            },
            title: {
              type: 'string',
              description: 'Opportunity title'
            },
            description: {
              type: 'string',
              description: 'Detailed opportunity description'
            },
            agency: {
              type: 'string',
              description: 'Government agency posting the opportunity'
            },
            subAgency: {
              type: 'string',
              nullable: true,
              description: 'Sub-agency or department'
            },
            postedDate: {
              type: 'string',
              format: 'date-time',
              description: 'Date when opportunity was posted'
            },
            deadline: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Submission deadline'
            },
            contractValue: {
              type: 'number',
              nullable: true,
              description: 'Estimated contract value in USD cents'
            },
            naicsCodes: {
              type: 'array',
              items: { type: 'string' },
              description: 'NAICS codes associated with the opportunity'
            },
            setAsideTypes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Set-aside designations (8a, HUBZone, etc.)'
            },
            state: {
              type: 'string',
              nullable: true,
              description: 'State where work will be performed'
            },
            placeOfPerformance: {
              type: 'string',
              nullable: true,
              description: 'Detailed place of performance'
            }
          }
        },
        Profile: {
          type: 'object',
          required: ['id', 'organizationId', 'companyName'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique profile identifier'
            },
            organizationId: {
              type: 'string',
              description: 'Organization this profile belongs to'
            },
            companyName: {
              type: 'string',
              description: 'Legal company name'
            },
            dbaName: {
              type: 'string',
              nullable: true,
              description: 'Doing Business As name'
            },
            uei: {
              type: 'string',
              nullable: true,
              pattern: '^.{12}$',
              description: 'Unique Entity Identifier (12 characters)'
            },
            duns: {
              type: 'string',
              nullable: true,
              pattern: '^\\d{9}$',
              description: 'DUNS number (9 digits)'
            },
            cageCode: {
              type: 'string',
              nullable: true,
              maxLength: 5,
              description: 'CAGE code (5 characters max)'
            },
            primaryNaics: {
              type: 'string',
              nullable: true,
              pattern: '^\\d{6}$',
              description: 'Primary NAICS code (6 digits)'
            },
            certifications: {
              type: 'object',
              description: 'Company certifications',
              properties: {
                has8a: { type: 'boolean' },
                hasHubZone: { type: 'boolean' },
                hasSdvosb: { type: 'boolean' },
                hasWosb: { type: 'boolean' },
                hasEdwosb: { type: 'boolean' },
                hasVosb: { type: 'boolean' },
                hasSdb: { type: 'boolean' }
              }
            }
          }
        },
        MatchScore: {
          type: 'object',
          required: ['opportunityId', 'score', 'factors'],
          properties: {
            opportunityId: {
              type: 'string',
              description: 'Opportunity identifier'
            },
            score: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Overall match score (0-100)'
            },
            factors: {
              type: 'object',
              description: 'Breakdown of scoring factors',
              properties: {
                naicsScore: { type: 'number', minimum: 0, maximum: 100 },
                locationScore: { type: 'number', minimum: 0, maximum: 100 },
                certificationScore: { type: 'number', minimum: 0, maximum: 100 },
                experienceScore: { type: 'number', minimum: 0, maximum: 100 }
              }
            },
            explanation: {
              type: 'string',
              description: 'Human-readable explanation of the score'
            }
          }
        },
        User: {
          type: 'object',
          required: ['id', 'email'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique user identifier'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            firstName: {
              type: 'string',
              nullable: true,
              description: 'User first name'
            },
            lastName: {
              type: 'string',
              nullable: true,
              description: 'User last name'
            },
            role: {
              type: 'string',
              enum: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
              description: 'User role within organization'
            }
          }
        },
        Organization: {
          type: 'object',
          required: ['id', 'name', 'slug'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique organization identifier'
            },
            name: {
              type: 'string',
              description: 'Organization name'
            },
            slug: {
              type: 'string',
              description: 'URL-friendly organization identifier'
            },
            logoUrl: {
              type: 'string',
              nullable: true,
              description: 'Organization logo URL'
            },
            website: {
              type: 'string',
              nullable: true,
              description: 'Organization website URL'
            },
            description: {
              type: 'string',
              nullable: true,
              description: 'Organization description'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Organization creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Organization last update timestamp'
            }
          }
        },
        OrganizationMember: {
          type: 'object',
          required: ['id', 'userId', 'organizationId', 'role'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique member identifier'
            },
            userId: {
              type: 'string',
              description: 'User identifier'
            },
            organizationId: {
              type: 'string',
              description: 'Organization identifier'
            },
            role: {
              type: 'string',
              enum: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
              description: 'Member role within organization'
            },
            user: {
              $ref: '#/components/schemas/User'
            },
            joinedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Member join timestamp'
            }
          }
        },
        ApiKey: {
          type: 'object',
          required: ['id', 'name', 'keyPrefix', 'scopes'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique API key identifier'
            },
            name: {
              type: 'string',
              description: 'Human-readable API key name'
            },
            keyPrefix: {
              type: 'string',
              description: 'First 8 characters of the API key for identification'
            },
            scopes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['read', 'write', 'admin']
              },
              description: 'API key permissions'
            },
            lastUsed: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Last time the API key was used'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'API key expiration date'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'API key creation timestamp'
            }
          }
        },
        Subscription: {
          type: 'object',
          required: ['id', 'status', 'priceId', 'planName'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique subscription identifier'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'canceled', 'past_due', 'unpaid'],
              description: 'Subscription status'
            },
            priceId: {
              type: 'string',
              description: 'Stripe price identifier'
            },
            planName: {
              type: 'string',
              description: 'Human-readable plan name'
            },
            currentPeriodStart: {
              type: 'string',
              format: 'date-time',
              description: 'Current billing period start'
            },
            currentPeriodEnd: {
              type: 'string',
              format: 'date-time',
              description: 'Current billing period end'
            },
            cancelAtPeriodEnd: {
              type: 'boolean',
              description: 'Whether subscription will cancel at period end'
            },
            trialEnd: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Trial period end date'
            }
          }
        },
        UsageRecord: {
          type: 'object',
          required: ['type', 'quantity', 'timestamp'],
          properties: {
            type: {
              type: 'string',
              enum: ['ai_request', 'opportunity_search', 'match_score', 'profile_update'],
              description: 'Type of usage event'
            },
            quantity: {
              type: 'number',
              minimum: 1,
              description: 'Number of units consumed'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When the usage occurred'
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
              description: 'Additional usage metadata'
            }
          }
        },
        UsageAnalytics: {
          type: 'object',
          required: ['period', 'total', 'breakdown'],
          properties: {
            period: {
              type: 'object',
              required: ['start', 'end'],
              properties: {
                start: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Analytics period start'
                },
                end: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Analytics period end'
                }
              }
            },
            total: {
              type: 'number',
              description: 'Total usage in the period'
            },
            breakdown: {
              type: 'object',
              additionalProperties: {
                type: 'number'
              },
              description: 'Usage breakdown by type'
            },
            limits: {
              type: 'object',
              additionalProperties: {
                type: 'number'
              },
              description: 'Usage limits by type'
            }
          }
        },
        HealthCheck: {
          type: 'object',
          required: ['status', 'timestamp'],
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'unhealthy', 'degraded'],
              description: 'Overall system health status'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp'
            },
            checks: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['healthy', 'unhealthy', 'degraded']
                  },
                  responseTime: {
                    type: 'number',
                    description: 'Response time in milliseconds'
                  },
                  message: {
                    type: 'string',
                    description: 'Status message'
                  }
                }
              },
              description: 'Individual service health checks'
            }
          }
        },
        AccountDeletionRequest: {
          type: 'object',
          required: ['id', 'status', 'requestedAt'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique deletion request identifier'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'cancelled'],
              description: 'Deletion request status'
            },
            requestedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When deletion was requested'
            },
            scheduledAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When deletion is scheduled to occur'
            },
            reason: {
              type: 'string',
              nullable: true,
              description: 'Reason for account deletion'
            },
            dataRetentionPeriod: {
              type: 'number',
              description: 'Days before permanent deletion'
            }
          }
        },
        CSRFToken: {
          type: 'object',
          required: ['token'],
          properties: {
            token: {
              type: 'string',
              description: 'CSRF protection token'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Token expiration time'
            }
          }
        },
        ContactOrganizationInfo: {
          type: 'object',
          description: 'Organization and agency information for the contact',
          properties: {
            agency: { type: 'string', description: 'Government agency name' },
            agencyAbbreviation: { type: 'string', description: 'Agency abbreviation (e.g., DOD, NASA, EPA)' },
            agencyCode: { type: 'string', description: 'Agency code' },
            office: { type: 'string', description: 'Office or sub-agency' },
            division: { type: 'string', description: 'Division within office' },
            location: { type: 'string', description: 'Office location' },
            website: { type: 'string', description: 'Agency website URL' },
            parentAgency: { type: 'string', description: 'Parent agency name' },
            agencyType: {
              type: 'string',
              enum: ['FEDERAL', 'STATE', 'LOCAL', 'MILITARY', 'INDEPENDENT'],
              description: 'Type of government agency'
            },
            contractingAuthority: { type: 'boolean', description: 'Has contracting authority' },
            jurisdiction: {
              type: 'array',
              items: { type: 'string' },
              description: 'Areas of jurisdiction'
            }
          }
        },
        ContactProfessionalInfo: {
          type: 'object',
          description: 'Professional information and role details',
          properties: {
            role: {
              type: 'string',
              enum: ['CONTRACTING_OFFICER', 'CONTRACTING_SPECIALIST', 'PROGRAM_MANAGER', 'PROJECT_MANAGER', 'TECHNICAL_LEAD', 'PROCUREMENT_ANALYST', 'LEGAL_COUNSEL', 'BUDGET_ANALYST', 'SMALL_BUSINESS_LIAISON', 'SECURITY_OFFICER', 'IT_DIRECTOR', 'CHIEF_INFORMATION_OFFICER', 'DEPUTY_DIRECTOR', 'DIRECTOR', 'ASSISTANT_SECRETARY', 'SECRETARY', 'ADMINISTRATOR', 'COMMISSIONER', 'OTHER'],
              description: 'Contact role within organization'
            },
            importance: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              description: 'Contact importance level'
            },
            decisionMaker: { type: 'boolean', description: 'Is a decision maker' },
            influenceLevel: { type: 'number', minimum: 0, maximum: 100, description: 'Influence level (0-100)' },
            contractAuthority: { type: 'boolean', description: 'Has contract authority' },
            budgetAuthority: { type: 'boolean', description: 'Has budget authority' },
            directReports: { type: 'number', description: 'Number of direct reports' },
            teamSize: { type: 'number', description: 'Size of team managed' },
            clearanceLevel: { type: 'string', description: 'Security clearance level' },
            clearanceType: { type: 'string', description: 'Type of security clearance' }
          }
        },
        Contact: {
          type: 'object',
          required: ['id', 'organizationId', 'firstName', 'lastName', 'source'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique contact identifier'
            },
            organizationId: {
              type: 'string',
              description: 'Organization this contact belongs to'
            },
            createdById: {
              type: 'string',
              description: 'User who created the contact'
            },
            updatedById: {
              type: 'string',
              nullable: true,
              description: 'User who last updated the contact'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Contact creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Contact last update timestamp'
            },
            deletedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Contact deletion timestamp (soft delete)'
            },
            firstName: {
              type: 'string',
              description: 'Contact first name'
            },
            lastName: {
              type: 'string',
              description: 'Contact last name'
            },
            email: {
              type: 'string',
              format: 'email',
              nullable: true,
              description: 'Primary email address'
            },
            phone: {
              type: 'string',
              nullable: true,
              description: 'Primary phone number'
            },
            title: {
              type: 'string',
              nullable: true,
              description: 'Job title or position'
            },
            alternateEmail: {
              type: 'string',
              format: 'email',
              nullable: true,
              description: 'Secondary email address'
            },
            alternatePhone: {
              type: 'string',
              nullable: true,
              description: 'Secondary phone number'
            },
            organizationInfo: {
              $ref: '#/components/schemas/ContactOrganizationInfo'
            },
            professionalInfo: {
              $ref: '#/components/schemas/ContactProfessionalInfo'
            },
            source: {
              type: 'string',
              enum: ['MANUAL', 'EXTRACTED', 'SAM_GOV', 'LINKEDIN', 'WEBSITE', 'OPPORTUNITY_DOC', 'REFERRAL', 'CONFERENCE', 'COLD_OUTREACH', 'IMPORT'],
              description: 'How the contact was acquired'
            },
            verified: {
              type: 'boolean',
              description: 'Whether contact information has been verified'
            }
          }
        },
        CreateContact: {
          type: 'object',
          required: ['firstName', 'lastName'],
          properties: {
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Contact first name'
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Contact last name'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Primary email address'
            },
            phone: {
              type: 'string',
              description: 'Primary phone number'
            },
            title: {
              type: 'string',
              maxLength: 200,
              description: 'Job title or position'
            },
            alternateEmail: {
              type: 'string',
              format: 'email',
              description: 'Secondary email address'
            },
            alternatePhone: {
              type: 'string',
              description: 'Secondary phone number'
            },
            organizationInfo: {
              $ref: '#/components/schemas/ContactOrganizationInfo'
            },
            professionalInfo: {
              $ref: '#/components/schemas/ContactProfessionalInfo'
            },
            source: {
              type: 'string',
              enum: ['MANUAL', 'EXTRACTED', 'SAM_GOV', 'LINKEDIN', 'WEBSITE', 'OPPORTUNITY_DOC', 'REFERRAL', 'CONFERENCE', 'COLD_OUTREACH', 'IMPORT'],
              default: 'MANUAL',
              description: 'How the contact was acquired'
            }
          }
        },
        UpdateContact: {
          type: 'object',
          properties: {
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Contact first name'
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Contact last name'
            },
            email: {
              type: 'string',
              format: 'email',
              nullable: true,
              description: 'Primary email address'
            },
            phone: {
              type: 'string',
              nullable: true,
              description: 'Primary phone number'
            },
            title: {
              type: 'string',
              maxLength: 200,
              nullable: true,
              description: 'Job title or position'
            },
            alternateEmail: {
              type: 'string',
              format: 'email',
              nullable: true,
              description: 'Secondary email address'
            },
            alternatePhone: {
              type: 'string',
              nullable: true,
              description: 'Secondary phone number'
            },
            organizationInfo: {
              $ref: '#/components/schemas/ContactOrganizationInfo'
            },
            professionalInfo: {
              $ref: '#/components/schemas/ContactProfessionalInfo'
            },
            verified: {
              type: 'boolean',
              description: 'Whether contact information has been verified'
            }
          }
        },
        Notification: {
          type: 'object',
          required: ['id', 'organizationId', 'type', 'category', 'title', 'message', 'priority'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique notification identifier'
            },
            organizationId: {
              type: 'string',
              description: 'Organization this notification belongs to'
            },
            userId: {
              type: 'string',
              nullable: true,
              description: 'Target user ID (null for organization-wide notifications)'
            },
            type: {
              type: 'string',
              enum: ['OPPORTUNITY', 'SYSTEM', 'UPDATE', 'WARNING', 'SUCCESS', 'BILLING', 'TEAM'],
              description: 'Notification type'
            },
            category: {
              type: 'string',
              enum: ['NEW_OPPORTUNITY', 'MATCH_SCORE', 'SYSTEM_UPDATE', 'BILLING', 'PROFILE', 'TEAM', 'DEADLINE', 'GENERAL'],
              description: 'Notification category'
            },
            title: {
              type: 'string',
              maxLength: 255,
              description: 'Notification title'
            },
            message: {
              type: 'string',
              maxLength: 1000,
              description: 'Notification message content'
            },
            actionUrl: {
              type: 'string',
              nullable: true,
              description: 'URL to navigate to when notification is clicked'
            },
            priority: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
              description: 'Notification priority level'
            },
            isRead: {
              type: 'boolean',
              description: 'Whether the current user has read this notification'
            },
            readAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When the current user read this notification'
            },
            metadata: {
              type: 'object',
              nullable: true,
              description: 'Additional notification metadata'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When this notification expires'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the notification was created'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the notification was last updated'
            },
            user: {
              type: 'object',
              nullable: true,
              description: 'Target user details (for user-specific notifications)',
              properties: {
                id: { type: 'string' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                email: { type: 'string' }
              }
            }
          }
        },
        NotificationPreference: {
          type: 'object',
          required: ['id', 'userId', 'category', 'inApp', 'email', 'sms', 'push', 'frequency'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique preference identifier'
            },
            userId: {
              type: 'string',
              description: 'User this preference belongs to'
            },
            category: {
              type: 'string',
              enum: ['NEW_OPPORTUNITY', 'MATCH_SCORE', 'SYSTEM_UPDATE', 'BILLING', 'PROFILE', 'TEAM', 'DEADLINE', 'GENERAL'],
              description: 'Notification category'
            },
            inApp: {
              type: 'boolean',
              description: 'Enable in-app notifications'
            },
            email: {
              type: 'boolean',
              description: 'Enable email notifications'
            },
            sms: {
              type: 'boolean',
              description: 'Enable SMS notifications'
            },
            push: {
              type: 'boolean',
              description: 'Enable push notifications'
            },
            frequency: {
              type: 'string',
              enum: ['REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'DISABLED'],
              description: 'Notification frequency'
            },
            digestTime: {
              type: 'string',
              nullable: true,
              pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
              description: 'Time for digest delivery (HH:MM format)'
            }
          }
        },
        NAICSCode: {
          type: 'object',
          required: ['code', 'title', 'description', 'level'],
          properties: {
            code: {
              type: 'string',
              pattern: '^\\d{2,6}$',
              description: 'NAICS code (2-6 digits)',
              example: '541511'
            },
            title: {
              type: 'string',
              description: 'Official NAICS code title',
              example: 'Custom Computer Programming Services'
            },
            description: {
              type: 'string',
              description: 'Detailed description of the industry classification',
              example: 'This industry comprises establishments primarily engaged in writing, modifying, testing, and supporting software to meet the needs of a particular customer.'
            },
            level: {
              type: 'string',
              enum: ['sector', 'subsector', 'industryGroup', 'industry', 'nationalIndustry'],
              description: 'Classification level in NAICS hierarchy',
              example: 'nationalIndustry'
            },
            sectorNumber: {
              type: 'integer',
              minimum: 11,
              maximum: 99,
              description: 'Two-digit sector number',
              example: 54
            },
            parentCode: {
              type: 'string',
              nullable: true,
              description: 'Parent code in the hierarchy',
              example: '54151'
            },
            hierarchy: {
              type: 'object',
              nullable: true,
              description: 'Full hierarchy information',
              properties: {
                sector: {
                  type: 'string',
                  description: 'Sector code',
                  example: '54'
                },
                subsector: {
                  type: 'string',
                  nullable: true,
                  description: 'Subsector code',
                  example: '541'
                },
                industryGroup: {
                  type: 'string',
                  nullable: true,
                  description: 'Industry group code',
                  example: '5415'
                },
                industry: {
                  type: 'string',
                  nullable: true,
                  description: 'Industry code',
                  example: '54151'
                }
              }
            },
            matchType: {
              type: 'string',
              enum: ['code', 'title', 'description'],
              nullable: true,
              description: 'How the search matched this result (when searching)',
              example: 'title'
            },
            relevanceScore: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              nullable: true,
              description: 'Search relevance score (when searching)',
              example: 0.95
            }
          }
        },
        NAICSSearchResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              required: ['codes', 'pagination', 'meta'],
              properties: {
                codes: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/NAICSCode' },
                  description: 'Array of NAICS codes matching the search criteria'
                },
                pagination: {
                  type: 'object',
                  required: ['total', 'limit', 'offset', 'hasMore'],
                  properties: {
                    total: {
                      type: 'integer',
                      description: 'Total number of matching codes',
                      example: 1057
                    },
                    limit: {
                      type: 'integer',
                      description: 'Number of codes returned in this response',
                      example: 100
                    },
                    offset: {
                      type: 'integer',
                      description: 'Number of codes skipped',
                      example: 0
                    },
                    hasMore: {
                      type: 'boolean',
                      description: 'Whether more results are available',
                      example: true
                    }
                  }
                },
                meta: {
                  type: 'object',
                  required: ['totalSectors', 'availableLevels', 'searchPerformed', 'processingTimeMs'],
                  properties: {
                    totalSectors: {
                      type: 'integer',
                      description: 'Total number of sectors in the database',
                      example: 20
                    },
                    availableLevels: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['sector', 'subsector', 'industryGroup', 'industry', 'nationalIndustry']
                      },
                      description: 'Available classification levels',
                      example: ['sector', 'subsector', 'industryGroup', 'industry', 'nationalIndustry']
                    },
                    searchPerformed: {
                      type: 'boolean',
                      description: 'Whether a search was performed (vs filtering)',
                      example: true
                    },
                    processingTimeMs: {
                      type: 'number',
                      description: 'Processing time in milliseconds',
                      example: 45.2
                    }
                  }
                }
              }
            }
          }
        },
        SavedSearch: {
          type: 'object',
          required: ['id', 'organizationId', 'userId', 'name', 'filters'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique saved search identifier'
            },
            organizationId: {
              type: 'string',
              description: 'Organization this saved search belongs to'
            },
            userId: {
              type: 'string',
              description: 'User who created this saved search'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Saved search creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Saved search last update timestamp'
            },
            deletedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Saved search deletion timestamp (soft delete)'
            },
            name: {
              type: 'string',
              maxLength: 100,
              description: 'User-friendly name for the search',
              example: 'Federal IT Contracts in Virginia'
            },
            description: {
              type: 'string',
              maxLength: 500,
              nullable: true,
              description: 'Optional description of the search',
              example: 'Federal IT service contracts in Virginia requiring security clearance'
            },
            category: {
              type: 'string',
              maxLength: 50,
              nullable: true,
              description: 'Optional category for organization',
              example: 'IT Services'
            },
            filters: {
              type: 'object',
              description: 'SearchFilters object containing filter criteria',
              additionalProperties: true,
              example: {
                "states": ["VA"],
                "naicsCodes": ["541511"],
                "securityClearances": ["SECRET"],
                "opportunityTypes": ["RFP"]
              }
            },
            lastUsedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When this search was last executed'
            },
            usageCount: {
              type: 'integer',
              minimum: 0,
              description: 'How many times this search has been used',
              example: 15
            },
            isDefault: {
              type: 'boolean',
              description: 'Whether this is the user\'s default search',
              example: false
            },
            isShared: {
              type: 'boolean',
              description: 'Whether this search is shared with organization',
              example: false
            },
            sharedBy: {
              type: 'string',
              nullable: true,
              description: 'User ID who shared this search (if shared)'
            },
            color: {
              type: 'string',
              pattern: '^#[0-9A-Fa-f]{6}$',
              nullable: true,
              description: 'Hex color for visual organization',
              example: '#3B82F6'
            },
            icon: {
              type: 'string',
              maxLength: 50,
              nullable: true,
              description: 'Icon identifier for visual organization',
              example: 'search'
            },
            isFavorite: {
              type: 'boolean',
              description: 'Whether user has favorited this search',
              example: false
            },
            alertEnabled: {
              type: 'boolean',
              description: 'Whether to send alerts for new matches',
              example: false
            },
            alertFrequency: {
              type: 'string',
              nullable: true,
              enum: ['daily', 'weekly', 'immediate'],
              description: 'Alert frequency setting'
            },
            lastAlertSent: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When last alert was sent'
            },
            user: {
              type: 'object',
              nullable: true,
              description: 'User who created the search (populated in responses)',
              properties: {
                id: { type: 'string' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                email: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: 'Resource not found',
                code: 'NOT_FOUND'
              }
            }
          }
        },
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthenticationError' },
              example: {
                success: false,
                error: 'Please sign in to access this resource',
                code: 'AUTHENTICATION_ERROR'
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationError' },
              example: {
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: [
                  {
                    field: 'email',
                    message: 'Invalid email format',
                    code: 'invalid_string'
                  }
                ]
              }
            }
          }
        },
        RateLimit: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: 'Rate limit exceeded. Please try again later.',
                code: 'RATE_LIMIT_EXCEEDED'
              }
            }
          }
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: 'An internal server error occurred',
                code: 'INTERNAL_ERROR'
              }
            }
          }
        }
      }
    },
    security: [
      {
        BearerAuth: []
      }
    ],
    paths: {
      '/api/v1/organizations': {
        get: {
          tags: ['Organizations'],
          summary: 'Get current organization',
          description: 'Retrieve details of the current user\'s organization',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Organization details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Organization' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' }
          }
        },
        post: {
          tags: ['Organizations'],
          summary: 'Create organization',
          description: 'Create a new organization (admin only)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'slug'],
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    description: { type: 'string' },
                    website: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Organization created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Organization' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        patch: {
          tags: ['Organizations'],
          summary: 'Update organization',
          description: 'Update organization settings',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    website: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Organization updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Organization' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        delete: {
          tags: ['Organizations'],
          summary: 'Delete organization',
          description: 'Delete organization (owner only)',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Organization deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/organizations/members': {
        get: {
          tags: ['Organizations'],
          summary: 'List organization members',
          description: 'Get all members of the current organization',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of organization members',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/OrganizationMember' }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        post: {
          tags: ['Organizations'],
          summary: 'Add organization member',
          description: 'Add a new member to the organization',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'role'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    role: {
                      type: 'string',
                      enum: ['ADMIN', 'MEMBER', 'VIEWER']
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Member added',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/OrganizationMember' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/organizations/members/{id}': {
        get: {
          tags: ['Organizations'],
          summary: 'Get organization member',
          description: 'Get details of a specific organization member',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Member ID'
            }
          ],
          responses: {
            '200': {
              description: 'Member details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/OrganizationMember' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        patch: {
          tags: ['Organizations'],
          summary: 'Update organization member',
          description: 'Update member role or permissions',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Member ID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    role: {
                      type: 'string',
                      enum: ['ADMIN', 'MEMBER', 'VIEWER']
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Member updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/OrganizationMember' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        delete: {
          tags: ['Organizations'],
          summary: 'Remove organization member',
          description: 'Remove a member from the organization',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Member ID'
            }
          ],
          responses: {
            '200': {
              description: 'Member removed',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/api-keys/{keyId}/rotate': {
        post: {
          tags: ['API Keys'],
          summary: 'Rotate API key',
          description: 'Generate a new API key and invalidate the old one',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'keyId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'API key ID'
            }
          ],
          responses: {
            '200': {
              description: 'API key rotated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          key: { type: 'string' },
                          name: { type: 'string' },
                          scopes: {
                            type: 'array',
                            items: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/portal': {
        post: {
          tags: ['Billing'],
          summary: 'Create billing portal session',
          description: 'Create a Stripe customer portal session for subscription management',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    returnUrl: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Portal session created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/invoices': {
        get: {
          tags: ['Billing'],
          summary: 'Get billing invoices',
          description: 'Retrieve billing invoice history',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
              description: 'Number of invoices to retrieve'
            }
          ],
          responses: {
            '200': {
              description: 'Invoice history',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            status: { type: 'string' },
                            amount: { type: 'number' },
                            currency: { type: 'string' },
                            created: { type: 'string', format: 'date-time' },
                            invoiceUrl: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/sync': {
        post: {
          tags: ['Billing'],
          summary: 'Sync billing data',
          description: 'Manually sync subscription data with Stripe',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Billing data synced',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Subscription' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/debug': {
        get: {
          tags: ['Billing'],
          summary: 'Debug billing information',
          description: 'Get detailed billing information for debugging',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Debug information',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        additionalProperties: true
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/test': {
        get: {
          tags: ['Billing'],
          summary: 'Test billing system',
          description: 'Test billing system functionality',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Test results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          tests: {
                            type: 'object',
                            additionalProperties: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/usage/analytics': {
        get: {
          tags: ['Billing'],
          summary: 'Get usage analytics',
          description: 'Retrieve detailed usage analytics',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'period',
              in: 'query',
              schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
              description: 'Analytics period'
            }
          ],
          responses: {
            '200': {
              description: 'Usage analytics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/UsageAnalytics' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/billing/usage/bulk': {
        post: {
          tags: ['Billing'],
          summary: 'Bulk record usage',
          description: 'Record multiple usage events in a single request',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['records'],
                  properties: {
                    records: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/UsageRecord' }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Usage recorded',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          recorded: { type: 'number' },
                          failed: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/opportunities/search': {
        get: {
          tags: ['Opportunities'],
          summary: 'Search opportunities (alternative)',
          description: 'Alternative endpoint for searching opportunities with different filters',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'query',
              in: 'query',
              schema: { type: 'string' },
              description: 'Search query'
            },
            {
              name: 'filters',
              in: 'query',
              schema: { type: 'string' },
              description: 'JSON-encoded filters object'
            }
          ],
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Opportunity' }
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          total: { type: 'number' },
                          page: { type: 'number' },
                          limit: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/opportunities-mock': {
        get: {
          tags: ['Opportunities'],
          summary: 'Get mock opportunities',
          description: 'Get mock opportunity data for development and testing',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Mock opportunities',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Opportunity' }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/match-scores': {
        get: {
          tags: ['Match Scores'],
          summary: 'Get match scores',
          description: 'Calculate match scores for opportunities',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'opportunityIds',
              in: 'query',
              schema: { type: 'string' },
              description: 'Comma-separated list of opportunity IDs'
            }
          ],
          responses: {
            '200': {
              description: 'Match scores',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/MatchScore' }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/user/sync': {
        post: {
          tags: ['Users'],
          summary: 'Sync user data',
          description: 'Synchronize user data with authentication provider',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'User data synced',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/csrf': {
        get: {
          tags: ['Utilities'],
          summary: 'Get CSRF token',
          description: 'Generate CSRF token for form protection',
          responses: {
            '200': {
              description: 'CSRF token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/CSRFToken' }
                    }
                  }
                }
              }
            },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/health/db': {
        get: {
          tags: ['Health'],
          summary: 'Database health check',
          description: 'Check database connectivity and basic health',
          responses: {
            '200': {
              description: 'Database health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          database: { type: 'string', enum: ['healthy', 'unhealthy'] },
                          responseTime: { type: 'number' },
                          timestamp: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '503': {
              description: 'Database unhealthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            }
          }
        }
      },
      '/api/v1/health/detailed': {
        get: {
          tags: ['Health'],
          summary: 'Detailed health check',
          description: 'Comprehensive system health check with detailed metrics',
          responses: {
            '200': {
              description: 'Detailed health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/HealthCheck' }
                    }
                  }
                }
              }
            },
            '503': {
              description: 'System unhealthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            }
          }
        }
      },
      '/api/v1/ai/health': {
        get: {
          tags: ['AI Services'],
          summary: 'Get AI system health',
          description: 'Get comprehensive AI system health status including provider availability, circuit breaker status, and configuration',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'AI system health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'string', format: 'date-time' },
                      system: {
                        type: 'object',
                        properties: {
                          health: {
                            type: 'object',
                            properties: {
                              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                              uptime: { type: 'number' },
                              providers: { type: 'number' },
                              activeModels: { type: 'number' }
                            }
                          },
                          configuration: {
                            type: 'object',
                            properties: {
                              providers: { type: 'array', items: { type: 'string' } },
                              enableFallback: { type: 'boolean' },
                              enableCircuitBreaker: { type: 'boolean' },
                              enableCaching: { type: 'boolean' }
                            }
                          },
                          validation: {
                            type: 'object',
                            properties: {
                              valid: { type: 'boolean' },
                              warnings: { type: 'array', items: { type: 'string' } }
                            }
                          }
                        }
                      },
                      providers: {
                        type: 'object',
                        properties: {
                          metrics: { type: 'object', additionalProperties: true },
                          circuitBreakers: { type: 'object', additionalProperties: { type: 'string' } },
                          configured: { type: 'array', items: { type: 'string' } }
                        }
                      },
                      capabilities: {
                        type: 'object',
                        properties: {
                          fallbackEnabled: { type: 'boolean' },
                          circuitBreakerEnabled: { type: 'boolean' },
                          cachingEnabled: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' },
            '500': { $ref: '#/components/responses/InternalError' }
          }
        },
        post: {
          tags: ['AI Services'],
          summary: 'Manage AI providers',
          description: 'Manage AI provider states and circuit breakers',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: {
                      type: 'string',
                      enum: ['reset_provider', 'force_open', 'force_close', 'reload_config'],
                      description: 'Management action to perform'
                    },
                    provider: {
                      type: 'string',
                      enum: ['openai', 'anthropic', 'google', 'azure'],
                      description: 'AI provider to manage (required for provider-specific actions)'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Action completed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/ai/analytics': {
        get: {
          tags: ['AI Services'],
          summary: 'Get AI analytics',
          description: 'Get AI performance analytics or cost analysis based on type parameter',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'type',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
                enum: ['performance', 'cost']
              },
              description: 'Type of analytics to retrieve'
            },
            {
              name: 'period',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['day', 'week', 'month'],
                default: 'day'
              },
              description: 'Time period for analytics'
            }
          ],
          responses: {
            '200': {
              description: 'Analytics data',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        type: 'object',
                        description: 'Performance analytics response',
                        properties: {
                          period: { type: 'string' },
                          metrics: {
                            type: 'object',
                            properties: {
                              totalRequests: { type: 'number' },
                              averageLatency: { type: 'number' },
                              successRate: { type: 'number' },
                              modelUsage: { type: 'object', additionalProperties: { type: 'number' } },
                              providerDistribution: { type: 'object', additionalProperties: { type: 'number' } }
                            }
                          },
                          trends: {
                            type: 'object',
                            properties: {
                              latency: { type: 'string' },
                              usage: { type: 'string' },
                              costs: { type: 'string' }
                            }
                          }
                        }
                      },
                      {
                        type: 'object',
                        description: 'Cost analytics response',
                        properties: {
                          period: { type: 'string' },
                          costs: {
                            type: 'object',
                            properties: {
                              total: { type: 'number' },
                              byProvider: { type: 'object', additionalProperties: { type: 'number' } },
                              byModel: { type: 'object', additionalProperties: { type: 'number' } },
                              byTask: { type: 'object', additionalProperties: { type: 'number' } }
                            }
                          },
                          optimization: {
                            type: 'object',
                            properties: {
                              potentialSavings: { type: 'number' },
                              recommendations: { type: 'array', items: { type: 'string' } }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/ai/config': {
        put: {
          tags: ['AI Services'],
          summary: 'Update AI configuration',
          description: 'Update AI service configuration parameters',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    maxConcurrentRequests: { type: 'number', minimum: 1, maximum: 1000 },
                    defaultTimeout: { type: 'number', minimum: 1000, maximum: 300000 },
                    enableFallback: { type: 'boolean' },
                    enableCircuitBreaker: { type: 'boolean' },
                    enableCaching: { type: 'boolean' },
                    preferredProviders: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['openai', 'anthropic', 'google', 'azure']
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Configuration updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      configuration: {
                        type: 'object',
                        properties: {
                          maxConcurrentRequests: { type: 'number' },
                          defaultTimeout: { type: 'number' },
                          enableFallback: { type: 'boolean' },
                          enableCircuitBreaker: { type: 'boolean' },
                          enableCaching: { type: 'boolean' },
                          preferredProviders: { type: 'array', items: { type: 'string' } }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/webhooks/clerk': {
        post: {
          tags: ['Webhooks'],
          summary: 'Clerk webhook handler',
          description: 'Handle Clerk authentication webhooks for user and organization events',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    data: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Webhook processed',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' }
          }
        }
      },
      '/api/v1/webhooks/stripe': {
        post: {
          tags: ['Webhooks'],
          summary: 'Stripe webhook handler',
          description: 'Handle Stripe billing webhooks for subscription events',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    data: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Webhook processed',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' }
          }
        }
      },
      '/api/v1/cron/hard-delete': {
        post: {
          tags: ['Utilities'],
          summary: 'Execute hard deletion',
          description: 'Execute scheduled hard deletions (cron job)',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Hard deletion executed',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          processed: { type: 'number' },
                          deleted: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/notifications': {
        get: {
          tags: ['Notifications'],
          summary: 'Get notifications',
          description: 'Retrieve notifications for the current user with per-user read/delete status',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'isRead',
              in: 'query',
              schema: { type: 'boolean' },
              description: 'Filter by read status'
            },
            {
              name: 'category',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['NEW_OPPORTUNITY', 'MATCH_SCORE', 'SYSTEM_UPDATE', 'BILLING', 'PROFILE', 'TEAM', 'DEADLINE', 'GENERAL']
              },
              description: 'Filter by notification category'
            },
            {
              name: 'priority',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
              },
              description: 'Filter by priority level'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
              description: 'Number of notifications to retrieve'
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', minimum: 0, default: 0 },
              description: 'Number of notifications to skip'
            }
          ],
          responses: {
            '200': {
              description: 'List of notifications',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      notifications: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Notification' }
                      },
                      unreadCount: {
                        type: 'number',
                        description: 'Total number of unread notifications for current user'
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          limit: { type: 'number' },
                          offset: { type: 'number' },
                          hasMore: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        post: {
          tags: ['Notifications'],
          summary: 'Create notification',
          description: 'Create a new notification (admin/owner only)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type', 'category', 'title', 'message'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['OPPORTUNITY', 'SYSTEM', 'UPDATE', 'WARNING', 'SUCCESS', 'BILLING', 'TEAM']
                    },
                    category: {
                      type: 'string',
                      enum: ['NEW_OPPORTUNITY', 'MATCH_SCORE', 'SYSTEM_UPDATE', 'BILLING', 'PROFILE', 'TEAM', 'DEADLINE', 'GENERAL']
                    },
                    title: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 255
                    },
                    message: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 1000
                    },
                    actionUrl: {
                      type: 'string',
                      format: 'uri'
                    },
                    priority: {
                      type: 'string',
                      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
                      default: 'MEDIUM'
                    },
                    userId: {
                      type: 'string',
                      description: 'Target user ID for user-specific notifications'
                    },
                    metadata: {
                      type: 'object',
                      description: 'Additional notification metadata'
                    },
                    expiresAt: {
                      type: 'string',
                      format: 'date-time',
                      description: 'When notification should expire'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Notification created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Notification' }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        patch: {
          tags: ['Notifications'],
          summary: 'Mark all notifications as read',
          description: 'Mark all notifications as read for the current user',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'action',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['mark-all-read'] },
              description: 'Action to perform'
            }
          ],
          responses: {
            '200': {
              description: 'All notifications marked as read',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/notifications/{id}': {
        get: {
          tags: ['Notifications'],
          summary: 'Get notification',
          description: 'Get a specific notification with user-specific read status',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Notification ID'
            }
          ],
          responses: {
            '200': {
              description: 'Notification details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Notification' }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        patch: {
          tags: ['Notifications'],
          summary: 'Update notification status',
          description: 'Update notification read status for the current user',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Notification ID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    isRead: {
                      type: 'boolean',
                      description: 'Mark notification as read/unread'
                    },
                    priority: {
                      type: 'string',
                      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
                      description: 'Update notification priority (admin only)'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Notification updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Notification' }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        delete: {
          tags: ['Notifications'],
          summary: 'Delete notification',
          description: 'Delete notification for the current user. For organization-wide notifications, this marks them as deleted only for the current user. For user-specific notifications or admin users, this may permanently delete the notification.',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Notification ID'
            }
          ],
          responses: {
            '200': {
              description: 'Notification deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/notifications/preferences': {
        get: {
          tags: ['Notifications'],
          summary: 'Get notification preferences',
          description: 'Get notification preferences for the current user',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Notification preferences',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/NotificationPreference' }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        },
        post: {
          tags: ['Notifications'],
          summary: 'Update notification preferences',
          description: 'Update notification preferences for the current user',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['category'],
                    properties: {
                      category: {
                        type: 'string',
                        enum: ['NEW_OPPORTUNITY', 'MATCH_SCORE', 'SYSTEM_UPDATE', 'BILLING', 'PROFILE', 'TEAM', 'DEADLINE', 'GENERAL']
                      },
                      inApp: { type: 'boolean' },
                      email: { type: 'boolean' },
                      sms: { type: 'boolean' },
                      push: { type: 'boolean' },
                      frequency: {
                        type: 'string',
                        enum: ['REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'DISABLED']
                      },
                      digestTime: {
                        type: 'string',
                        pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Preferences updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/NotificationPreference' }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimit' }
          }
        }
      },
      '/api/v1/notifications/stream': {
        get: {
          tags: ['Notifications'],
          summary: 'Real-time notification stream',
          description: 'Server-Sent Events (SSE) stream for real-time notifications',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'SSE stream established',
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    description: 'Server-Sent Events stream'
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },
      '/api/v1/admin/error-config': {
        get: {
          tags: ['Admin - Error Configuration'],
          summary: 'Get current error handling configuration',
          description: 'Returns the current error handling configuration including both environment defaults and runtime overrides',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Current error configuration',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      config: {
                        type: 'object',
                        description: 'Current error handling configuration'
                      },
                      envVarOverrides: {
                        type: 'object',
                        description: 'Current environment variable overrides'
                      },
                      availableVars: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            configPath: { type: 'string' },
                            description: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['number', 'boolean', 'string', 'array']
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '500': { $ref: '#/components/responses/InternalError' }
          }
        },
        put: {
          tags: ['Admin - Error Configuration'],
          summary: 'Update error handling configuration',
          description: 'Update error handling configuration using either nested config object or environment variables',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updateType: {
                      type: 'string',
                      enum: ['config', 'envVars'],
                      description: 'Whether to update using config object or environment variables'
                    },
                    config: {
                      type: 'object',
                      description: 'Nested configuration object (when updateType is "config")'
                    },
                    envVars: {
                      type: 'object',
                      description: 'Environment variable overrides (when updateType is "envVars")'
                    },
                    validate: {
                      type: 'boolean',
                      default: true,
                      description: 'Whether to validate the configuration before applying'
                    }
                  },
                  example: {
                    updateType: 'envVars',
                    envVars: {
                      ERROR_RETRY_MAX_ATTEMPTS: 5,
                      ERROR_NOTIFICATIONS_MAX_PER_MINUTE: 15
                    },
                    validate: true
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Configuration updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      updatedConfig: { type: 'object' },
                      appliedOverrides: { type: 'object' }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '500': { $ref: '#/components/responses/InternalError' }
          }
        },
        delete: {
          tags: ['Admin - Error Configuration'],
          summary: 'Reset error configuration to environment defaults',
          description: 'Remove all runtime configuration overrides and reset to environment variable defaults',
          security: [{ BearerAuth: [] }],
          inputSchema: [
            {
              name: 'keys',
              in: 'query',
              schema: { type: 'string' },
              description: 'Comma-separated list of specific environment variable keys to remove (optional)',
              example: 'ERROR_RETRY_MAX_ATTEMPTS,ERROR_NOTIFICATIONS_MAX_PER_MINUTE'
            }
          ],
          responses: {
            '200': {
              description: 'Configuration reset successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      resetConfig: { type: 'object' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '500': { $ref: '#/components/responses/InternalError' }
          }
        }
      },
      '/api/v1/admin/error-config/validate': {
        post: {
          tags: ['Admin - Error Configuration'],
          summary: 'Validate error configuration without applying changes',
          description: 'Test configuration changes for validity without actually applying them to the system',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updateType: {
                      type: 'string',
                      enum: ['config', 'envVars'],
                      description: 'Whether to validate config object or environment variables'
                    },
                    config: {
                      type: 'object',
                      description: 'Nested configuration object to validate (when updateType is "config")'
                    },
                    envVars: {
                      type: 'object',
                      description: 'Environment variable overrides to validate (when updateType is "envVars")'
                    }
                  },
                  example: {
                    updateType: 'envVars',
                    envVars: {
                      ERROR_RETRY_MAX_ATTEMPTS: 5,
                      ERROR_NOTIFICATIONS_MAX_PER_MINUTE: 15,
                      ERROR_CIRCUIT_BREAKER_ERROR_RATE: 0.2
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Validation results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      valid: { type: 'boolean' },
                      errors: {
                        type: 'array',
                        items: { type: 'string' }
                      },
                      warnings: {
                        type: 'array',
                        items: { type: 'string' }
                      },
                      recommendations: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            current: { type: 'string' },
                            recommended: { type: 'string' },
                            reason: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '500': { $ref: '#/components/responses/InternalError' }
          }
        }
      }
    },
    tags: [
      {
        name: 'Opportunities',
        description: 'Government contracting opportunity search and retrieval'
      },
      {
        name: 'Match Scores',
        description: 'AI-powered opportunity matching and scoring'
      },
      {
        name: 'Profiles',
        description: 'Company profile management'
      },
      {
        name: 'Users',
        description: 'User account management'
      },
      {
        name: 'Organizations',
        description: 'Organization and team management'
      },
      {
        name: 'API Keys',
        description: 'API key management and authentication'
      },
      {
        name: 'Billing',
        description: 'Subscription billing and usage tracking'
      },
      {
        name: 'Account Management',
        description: 'Account lifecycle and deletion management'
      },
      {
        name: 'AI Services',
        description: 'AI provider management and intelligent routing'
      },
      {
        name: 'Health',
        description: 'System health monitoring and diagnostics'
      },
      {
        name: 'Webhooks',
        description: 'Webhook handling for external integrations'
      },
      {
        name: 'Utilities',
        description: 'System utilities and helper endpoints'
      },
      {
        name: 'Notifications',
        description: 'Real-time notification system with per-user tracking'
      },
      {
        name: 'Admin - Error Configuration',
        description: 'Administrative error handling configuration management'
      },
      {
        name: 'NAICS Codes',
        description: 'North American Industry Classification System (NAICS) codes search and retrieval'
      },
      {
        name: 'Contacts',
        description: 'Contact and CRM system for managing government contractor relationships'
      }
    ]
  },
  apis: [
    './src/app/api/v1/**/*.ts', // All v1 API route files
    './src/lib/validations.ts', // Validation schemas
  ],
}

// In development, always generate fresh specs by calling swaggerJSDoc directly
// In production, cache the specs for performance
const isDevelopment = process.env.NODE_ENV === 'development'

const swaggerSpec = isDevelopment
  ? swaggerJSDoc(options)  // Generate fresh in development
  : swaggerJSDoc(options); // Cache in production

export default swaggerSpec;
