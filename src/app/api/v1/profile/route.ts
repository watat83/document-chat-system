/**
 * @swagger
 * /api/profile:
 *   get:
 *     tags: [Profiles]
 *     summary: Get user's company profile
 *     description: |
 *       Retrieve the authenticated user's company profile including basic information,
 *       certifications, NAICS codes, and profile completeness percentage.
 *       If no profile exists, a default profile will be created automatically.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved or created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   patch:
 *     tags: [Profiles]
 *     summary: Update user's company profile
 *     description: |
 *       Update the authenticated user's company profile with new information.
 *       All fields are optional and only provided fields will be updated.
 *       Profile completeness is automatically recalculated after updates.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 minLength: 1
 *                 description: Legal company name
 *                 example: "ACME Contracting Inc."
 *               dbaName:
 *                 type: string
 *                 nullable: true
 *                 description: Doing Business As name
 *                 example: "ACME Tech Solutions"
 *               uei:
 *                 type: string
 *                 pattern: "^.{12}$"
 *                 nullable: true
 *                 description: Unique Entity Identifier (exactly 12 characters)
 *                 example: "ACME12345678"
 *               duns:
 *                 type: string
 *                 pattern: "^\\d{9}$"
 *                 nullable: true
 *                 description: DUNS number (exactly 9 digits)
 *                 example: "123456789"
 *               cageCode:
 *                 type: string
 *                 maxLength: 5
 *                 nullable: true
 *                 description: CAGE code (5 characters or less)
 *                 example: "1ABC2"
 *               addressLine1:
 *                 type: string
 *                 maxLength: 255
 *                 nullable: true
 *                 description: Primary address line
 *                 example: "123 Business Ave"
 *               city:
 *                 type: string
 *                 maxLength: 100
 *                 nullable: true
 *                 example: "Washington"
 *               state:
 *                 type: string
 *                 pattern: "^[A-Z]{2}$"
 *                 nullable: true
 *                 description: Two-letter state code
 *                 example: "DC"
 *               zipCode:
 *                 type: string
 *                 pattern: "^\\d{5}(-\\d{4})?$"
 *                 nullable: true
 *                 description: ZIP code (5 digits with optional +4)
 *                 example: "20001"
 *               primaryNaics:
 *                 type: string
 *                 pattern: "^\\d{6}$"
 *                 nullable: true
 *                 description: Primary NAICS code (6 digits)
 *                 example: "541511"
 *               certifications:
 *                 type: object
 *                 description: Company certifications
 *                 properties:
 *                   has8a:
 *                     type: boolean
 *                     description: 8(a) Business Development certification
 *                   hasHubZone:
 *                     type: boolean
 *                     description: HUBZone certification
 *                   hasSdvosb:
 *                     type: boolean
 *                     description: Service-Disabled Veteran-Owned Small Business
 *                   hasWosb:
 *                     type: boolean
 *                     description: Women-Owned Small Business
 *                   hasEdwosb:
 *                     type: boolean
 *                     description: Economically Disadvantaged WOSB
 *                   hasVosb:
 *                     type: boolean
 *                     description: Veteran-Owned Small Business
 *                   hasSdb:
 *                     type: boolean
 *                     description: Small Disadvantaged Business
 *           examples:
 *             basic_update:
 *               summary: Basic company information update
 *               value:
 *                 companyName: "Updated Company Name"
 *                 addressLine1: "456 New Street"
 *                 city: "Arlington"
 *                 state: "VA"
 *             certification_update:
 *               summary: Certification status update
 *               value:
 *                 certifications:
 *                   has8a: true
 *                   hasHubZone: false
 *                   hasSdvosb: true
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Profile'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ProfileUpdateSchema } from '@/lib/validations'
import { asyncHandler, commonErrors } from '@/lib/api-errors'
import { redis } from '@/lib/redis'
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking'
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger'


// Calculate profile completeness percentage
function calculateProfileCompleteness(profile: any): number {
  const fields = [
    // Basic info (35% weight - reduced to make room for SAM.gov)
    { field: 'companyName', weight: 5 },
    { field: 'addressLine1', weight: 3 },
    { field: 'city', weight: 3 },
    { field: 'state', weight: 3 },
    { field: 'zipCode', weight: 3 },
    { field: 'country', weight: 2 },
    { field: 'primaryContactEmail', weight: 4 }, // Reduced from 5
    { field: 'primaryContactName', weight: 3 },
    { field: 'primaryContactPhone', weight: 2 },
    { field: 'website', weight: 2 },
    { field: 'businessType', weight: 2 }, // Reduced from 3
    { field: 'yearEstablished', weight: 2 },
    { field: 'employeeCount', weight: 1 }, // Reduced from 2
    { field: 'annualRevenue', weight: 1 }, // Reduced from 2

    // Government identifiers (20% weight)
    { field: 'uei', weight: 5 },
    { field: 'cageCode', weight: 5 },
    { field: 'duns', weight: 3 },
    { field: 'primaryNaics', weight: 7 },

    // SAM.gov Integration (10% weight - new high-priority field)
    { field: 'samGovSyncStatus', weight: 10 },

    // Certifications (15% weight)
    { field: 'certifications', weight: 15 },

    // Capabilities and preferences (20% weight - reduced to make room for SAM.gov)
    { field: 'coreCompetencies', weight: 7 }, // Reduced from 8
    { field: 'pastPerformance', weight: 4 }, // Reduced from 5
    { field: 'organizationLevels', weight: 5 }, // Reduced from 6
    { field: 'geographicPreferences', weight: 4 } // Reduced from 6
  ]

  let completedWeight = 0

  fields.forEach(({ field, weight }) => {
    const value = profile[field]

    if (field === 'samGovSyncStatus') {
      // SAM.gov completeness calculation with partial scoring
      const samGovData = profile.samGovData
      const samGovSyncedAt = profile.samGovSyncedAt

      // Apply partial completion logic for SAM.gov field
      let samGovCompletionRatio = 0

      // Full completion (100%) - actual sync with SAM.gov system
      if ((samGovData && (samGovData.uei || samGovData.entityName)) || samGovSyncedAt) {
        samGovCompletionRatio = 1.0
      }
      // Partial completion (40%) - manual UEI and CAGE code entry
      else if (profile.uei && profile.cageCode) {
        samGovCompletionRatio = 0.4
      }
      // Basic info (20%) - just UEI or just CAGE code
      else if (profile.uei || profile.cageCode) {
        samGovCompletionRatio = 0.2
      }

      // Apply the partial completion to the weight (instead of binary complete/incomplete)
      completedWeight += weight * samGovCompletionRatio
      return // Skip the normal completion logic for this field
    }

    let isComplete = false

    if (field === 'certifications') {
      // Check if certifications object exists AND has certifications
      if (value && typeof value === 'object') {
        // Handle new structure: {certifications: [...], setAsides: [...]}
        if ('certifications' in value && 'setAsides' in value) {
          const certifications = value.certifications || []
          const setAsides = value.setAsides || []
          isComplete = certifications.length > 0 || setAsides.length > 0
        }
        // Handle legacy structure: {has8a: true, hasHubZone: false, ...}
        else {
          const hasActiveCertification = Object.entries(value).some(([key, val]) =>
            key.startsWith('has') && val === true
          )
          isComplete = hasActiveCertification
        }
      }
    } else if (field === 'coreCompetencies') {
      isComplete = Array.isArray(value) && value.length > 0
    } else if (field === 'pastPerformance') {
      isComplete = value && typeof value === 'object' && (value.description || value.keyProjects?.length > 0)
    } else if (field === 'organizationLevels') {
      isComplete = Array.isArray(value) && value.length > 0
    } else if (field === 'geographicPreferences') {
      if (value && typeof value === 'object') {
        // Check for new grouped structure: {preferences: {country: [], state: [], ...}, workFromHome, travelWillingness, maxTravelPercentage}
        if (value.preferences && typeof value.preferences === 'object' && !Array.isArray(value.preferences)) {
          const hasLocationPreferences = Object.values(value.preferences).some(
            (arr: any) => Array.isArray(arr) && arr.length > 0
          )
          const hasTravelInfo = value.workFromHome !== undefined || value.travelWillingness || value.maxTravelPercentage !== undefined
          isComplete = hasLocationPreferences || hasTravelInfo
        }
        // Handle legacy flat array structure: {preferences: [...], workFromHome, travelWillingness, maxTravelPercentage}
        else if (Array.isArray(value.preferences)) {
          const hasLocationPreferences = value.preferences.length > 0
          const hasTravelInfo = value.workFromHome !== undefined || value.travelWillingness || value.maxTravelPercentage !== undefined
          isComplete = hasLocationPreferences || hasTravelInfo
        }
        // Handle other object structures
        else {
          isComplete = value.workFromHome !== undefined || value.travelWillingness || value.maxTravelPercentage !== undefined
        }
      }
    } else {
      isComplete = value != null && value !== ''
    }

    if (isComplete) {
      completedWeight += weight
    }
  })

  return Math.min(100, completedWeight)
}

// Extract profile fetching logic for caching
async function fetchProfileData(userId: string) {
  console.log('Profile GET: Starting request')
  console.log('Profile GET: userId =', userId)

  if (!userId) {
    console.log('Profile GET: No userId, returning 401')
    throw commonErrors.unauthorized()
  }

    // Get user's organization or create if doesn't exist
    console.log('Profile GET: Looking for user in database')
    console.log('Profile GET: searching for clerkId =', userId)
    let user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })
    console.log('Profile GET: Found user =', !!user)
    if (user) {
      console.log('Profile GET: User exists with ID:', user.id, 'orgId:', user.organizationId)
    }

    // If user doesn't exist, create them and their organization (auto-sync from Clerk)
    if (!user) {
      console.log('Profile GET: User not found in database, creating from Clerk data')
      const clerkUser = await currentUser()
      if (!clerkUser) {
        console.log('Profile GET: Could not get Clerk user data')
        throw commonErrors.unauthorized()
      }

      // Create organization first (with unique slug handling)
      let organization
      let attempts = 0
      const maxAttempts = 5

      while (!organization && attempts < maxAttempts) {
        attempts++
        let slug

        if (attempts === 1) {
          slug = `org-${userId.slice(0, 8)}`
        } else if (attempts === 2) {
          slug = `org-${userId}`
        } else {
          // Use timestamp + random for unique slug
          slug = `org-${userId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        }

        try {
          organization = await db.organization.create({
            data: {
              name: `${clerkUser.firstName || 'User'} ${clerkUser.lastName || ''}'s Organization`.trim(),
              slug: slug,
            }
          })
          console.log(`Profile GET: Created organization with slug: ${slug}`)
        } catch (error: any) {
          if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
            console.log(`Profile GET: Slug conflict on attempt ${attempts}: ${slug}`)
            if (attempts >= maxAttempts) {
              console.error(`Profile GET: Failed to create organization after ${maxAttempts} attempts`)
              throw new Error('Failed to create organization due to slug conflicts')
            }
            // Continue to next iteration
            continue
          } else {
            throw error
          }
        }
      }

      if (!organization) throw new Error('Organization provisioning unavailable');
      // Create user
      user = await db.user.create({
        data: {
          clerkId: userId,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
          organizationId: organization.id,
          role: 'OWNER',
          lastActiveAt: new Date(),
        },
        include: { organization: true }
      })

      console.log('Profile GET: Created new user and organization:', { userId: user.id, orgId: user.organizationId })
    }

    // Usage tracking is now handled in the GET method to avoid counting cache hits

    // Get organization's profile (with retry logic for race conditions)
    console.log('Profile GET: Looking for profile')
    let profile = await db.profile.findFirst({
      where: {
        organizationId: user.organizationId,
        deletedAt: null
      },
      include: {
        organization: true,
        createdBy: true,
        updatedBy: true
      }
    })

    if (!profile) {
      console.log('Profile GET: Profile not found, attempting to create default profile')

      // Use a database transaction to prevent race conditions
      try {
        profile = await db.$transaction(async (tx) => {
          // Double-check that no profile exists (race condition protection)
          const existingProfile = await tx.profile.findFirst({
            where: {
              organizationId: user.organizationId,
              deletedAt: null
            },
            include: {
              organization: true,
              createdBy: true,
              updatedBy: true
            }
          })

          if (existingProfile) {
            console.log('Profile GET: Found existing profile in transaction')
            return existingProfile
          }

          // Create new profile within transaction
          console.log('Profile GET: Creating new profile in transaction')
          const newProfile = await tx.profile.create({
            data: {
              organizationId: user.organizationId,
              createdById: user.id,
              updatedById: user.id,
              companyName: user.organization.name || 'New Company',
              uei: null,
              profileCompleteness: 10,
              businessType: 'OTHER',
              country: 'USA'
            },
            include: {
              organization: true,
              createdBy: true,
              updatedBy: true
            }
          });

          // Log profile creation for audit trail (outside transaction to avoid conflicts)
          setTimeout(async () => {
            try {
              await crudAuditLogger.logProfileOperation(
                'CREATE',
                newProfile.id,
                newProfile.companyName || 'New Company',
                null, // No previous data
                newProfile,
                {
                  endpoint: '/api/v1/profile',
                  method: 'GET',
                  reason: 'Auto-created on first profile access',
                  userAgent: 'server-generated'
                }
              );
            } catch (auditError) {
              console.error('Failed to create profile creation audit log:', auditError);
            }
          }, 100);

          return newProfile;
        })

        console.log('Profile GET: Successfully created/found profile:', profile.id)
        return {
          success: true,
          data: profile
        }

      } catch (error: any) {
        console.error('Profile GET: Transaction failed:', error)

        // Final fallback - try to find any existing profile one more time
        const fallbackProfile = await db.profile.findFirst({
          where: {
            organizationId: user.organizationId,
            deletedAt: null
          },
          include: {
            organization: true,
            createdBy: true,
            updatedBy: true
          }
        })

        if (fallbackProfile) {
          console.log('Profile GET: Found fallback profile after transaction failure')
          return {
            success: true,
            data: fallbackProfile
          }
        }

        // If all else fails, throw the error
        throw error
      }
    }

    // Recalculate profile completeness to ensure it's current
    const currentCompleteness = calculateProfileCompleteness(profile)

    // If completeness has changed, update it in the database
    if (currentCompleteness !== profile.profileCompleteness) {
      console.log(`Profile completeness changed from ${profile.profileCompleteness}% to ${currentCompleteness}%`)
      const updatedProfile = await db.profile.update({
        where: { id: profile.id },
        data: { profileCompleteness: currentCompleteness },
        include: {
          organization: true,
          createdBy: true,
          updatedBy: true
        }
      })

      return {
        success: true,
        data: updatedProfile
      }
    }

    return {
      success: true,
      data: profile
    }
}

export const GET = asyncHandler(async () => {
  const { userId } = await auth()

  if (!userId) {
    throw commonErrors.unauthorized()
  }

  // Fetch profile data directly without caching
  const result = await fetchProfileData(userId)

  // Track this API call
  try {
    // Get user organization for tracking
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true }
    })

    if (user) {
      await UsageTrackingService.trackUsage({
        organizationId: user.organizationId,
        usageType: UsageType.API_CALL,
        quantity: 1,
        resourceType: 'profile',
        metadata: {
          endpoint: '/api/profile',
          cached: false
        }
      });
    }
  } catch (trackingError) {
    console.warn('Failed to track profile API usage:', trackingError);
    // Don't fail the request if tracking fails
  }

  // Log profile read operation for audit trail
  if (result.success && result.data) {
    try {
      await crudAuditLogger.logProfileOperation(
        'READ',
        result.data.id,
        result.data.companyName || 'Unknown Company',
        null,
        { profileId: result.data.id }, // Minimal data for READ operation
        {
          endpoint: '/api/v1/profile',
          method: 'GET',
          userAgent: 'profile-get-request',
          profileCompleteness: result.data.profileCompleteness
        }
      );
    } catch (auditError) {
      console.error('Failed to create profile read audit log:', auditError);
      // Don't fail the request
    }
  }

  return NextResponse.json(result)
})

// POST endpoint removed - GET endpoint handles profile creation automatically

export const PATCH = asyncHandler(async (request: NextRequest) => {
  const { userId } = await auth()

  if (!userId) {
    throw commonErrors.unauthorized()
  }

    const body = await request.json()

    // Transform old format data to new format (for existing users)
    const transformedBody = { ...body }

    // Transform organizationLevels to uppercase if present
    if (transformedBody.organizationLevels && Array.isArray(transformedBody.organizationLevels)) {
      transformedBody.organizationLevels = transformedBody.organizationLevels.map((level: string) =>
        level.toUpperCase()
      )
    }

    // Handle pastPerformance keyProjects transformation
    if (transformedBody.pastPerformance?.keyProjects) {
      transformedBody.pastPerformance.keyProjects = transformedBody.pastPerformance.keyProjects.map((project: any) => ({
        ...project,
        // Transform old field names to new schema
        title: project.title || project.name,
        value: typeof project.value === 'string' ? parseInt(project.value) || 0 : project.value,
        completedYear: typeof project.completedYear === 'string' ? parseInt(project.completedYear) || 0 : project.completedYear || (typeof project.completionYear === 'string' ? parseInt(project.completionYear) || 0 : project.completionYear),
        // Map client field to customerType with default value and capitalize first letter
        customerType: project.customerType
          ? project.customerType.charAt(0).toUpperCase() + project.customerType.slice(1).toLowerCase()
          : (project.client ? 'Federal' : undefined),
        // Preserve client field for display purposes
        client: project.client,
        clientContactId: project.clientContactId || undefined,
        contractId: project.contractId || undefined,

        // Include all the new enhanced fields for profile enrichment
        agency: project.agency || undefined,
        naicsCode: project.naicsCode || undefined,
        pscCode: project.pscCode || undefined,
        contractType: project.contractType || undefined,
        setAsideType: project.setAsideType || undefined,
        securityClearanceRequired: project.securityClearanceRequired || undefined,
        performanceLocation: project.performanceLocation || undefined,
        primeContractor: project.primeContractor !== undefined ? project.primeContractor : undefined,

        // Include other optional fields that may exist
        contractDuration: project.contractDuration || undefined,
        subcontractorRole: project.subcontractorRole || undefined,
        teamSize: project.teamSize || undefined,
        customerSatisfactionRating: project.customerSatisfactionRating || undefined,
        awardFeeEarned: project.awardFeeEarned || undefined,
        keyAchievements: project.keyAchievements || undefined,
        technologiesUsed: project.technologiesUsed || undefined,
        certificationsMet: project.certificationsMet || undefined
      }))
    }

    // Debug logging to track certification data flow
    console.log('Profile PATCH: Received body:', JSON.stringify(body, null, 2))
    console.log('Profile PATCH: Transformed body:', JSON.stringify(transformedBody, null, 2))
    if (body.certifications) {
      console.log('Profile PATCH: Certifications data:', JSON.stringify(body.certifications, null, 2))
      console.log('Profile PATCH: SDVOSB expiration date:', body.certifications.sdvosbExpirationDate)
    }

    const validatedData = ProfileUpdateSchema.parse(transformedBody)

    // Debug logging to track what survived validation
    console.log('Profile PATCH: Validated data:', JSON.stringify(validatedData, null, 2))
    if (validatedData.certifications) {
      console.log('Profile PATCH: Validated certifications:', JSON.stringify(validatedData.certifications, null, 2))
      console.log('Profile PATCH: Validated SDVOSB expiration date:', validatedData.certifications.legacy?.sdvosbExpirationDate)
    }

    // Get user's organization and profile or create if doesn't exist
    let user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    // If user doesn't exist, create them and their organization
    if (!user) {
      const clerkUser = await currentUser()
      if (!clerkUser) {
        return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
      }

      // Create organization first (with unique slug handling)
      let organization
      let attempts = 0
      const maxAttempts = 5

      while (!organization && attempts < maxAttempts) {
        attempts++
        let slug

        if (attempts === 1) {
          slug = `org-${userId.slice(0, 8)}`
        } else if (attempts === 2) {
          slug = `org-${userId}`
        } else {
          // Use timestamp + random for unique slug
          slug = `org-${userId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        }

        try {
          organization = await db.organization.create({
            data: {
              name: `${clerkUser.firstName || 'User'} ${clerkUser.lastName || 'Organization'}`,
              slug: slug,
            }
          })
          console.log(`Profile PATCH: Created organization with slug: ${slug}`)
        } catch (error: any) {
          if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
            console.log(`Profile PATCH: Slug conflict on attempt ${attempts}: ${slug}`)
            if (attempts >= maxAttempts) {
              console.error(`Profile PATCH: Failed to create organization after ${maxAttempts} attempts`)
              throw new Error('Failed to create organization due to slug conflicts')
            }
            // Continue to next iteration
            continue
          } else {
            throw error
          }
        }
      }

      if (!organization) throw new Error('Organization provisioning unavailable');
      // Create user
      user = await db.user.create({
        data: {
          clerkId: userId,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
          organizationId: organization.id,
          role: 'OWNER',
          lastActiveAt: new Date(),
        },
        include: { organization: true }
      })
    }

    console.log('Profile PATCH: Looking for existing profile for organizationId:', user.organizationId)

    // Debug: Check if there are multiple profiles (shouldn't happen)
    const allProfiles = await db.profile.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null
      }
    })
    console.log('Profile PATCH: Found profiles count:', allProfiles.length)
    if (allProfiles.length > 1) {
      console.warn('Profile PATCH: WARNING - Multiple profiles found for organization:', allProfiles.map(p => ({ id: p.id, createdAt: p.createdAt })))
    }

    const existingProfile = allProfiles[0] || null

    console.log('Profile PATCH: Using profile:', !!existingProfile, existingProfile?.id)

    if (!existingProfile) {
      console.log('Profile PATCH: No existing profile found - creating new profile first')

      // Create profile if it doesn't exist (for backward compatibility)
      const newProfile = await db.profile.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          updatedById: user.id,
          companyName: user.organization.name || 'New Company',
          uei: null,
          profileCompleteness: 10,
          businessType: 'OTHER',
          country: 'USA',
          ...validatedData
        },
        include: {
          organization: true,
          createdBy: true,
          updatedBy: true
        }
      })

      console.log('Profile PATCH: Created new profile with ID:', newProfile.id)

      return NextResponse.json({
        success: true,
        data: newProfile
      })
    }

    // Prepare update data
    const updateData: any = {
      ...validatedData,
      updatedById: user.id
    }

    // Calculate new profile completeness
    const updatedProfileData = { ...existingProfile, ...validatedData }
    updateData.profileCompleteness = calculateProfileCompleteness(updatedProfileData)

    console.log('Profile PATCH: Updating profile with ID:', existingProfile.id)
    console.log('Profile PATCH: Update data:', JSON.stringify(updateData, null, 2))

    // Update profile
    const updatedProfile = await db.profile.update({
      where: { id: existingProfile.id },
      data: updateData,
      include: {
        organization: true,
        createdBy: true,
        updatedBy: true
      }
    })

    console.log('Profile PATCH: Profile updated successfully, ID:', updatedProfile.id)

    // Log profile update for audit trail
    try {
      await crudAuditLogger.logProfileOperation(
        'UPDATE',
        updatedProfile.id,
        updatedProfile.companyName || 'Unknown Company',
        existingProfile, // Previous data
        updatedProfile,  // Current data
        {
          endpoint: '/api/v1/profile',
          method: 'PATCH',
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown',
          completenessChange: {
            from: existingProfile.profileCompleteness,
            to: updatedProfile.profileCompleteness
          }
        }
      );
    } catch (auditError) {
      console.error('Failed to create profile audit log:', auditError);
      // Don't fail the main operation
    }

    // Clear cached match scores since profile data changed
    try {
      const pattern = `match_score:${existingProfile.id}:*`
      const keys = await redis.keys(pattern)

      if (keys.length > 0) {
        await redis.del(...keys)
        console.log(`Cleared ${keys.length} cached match scores after profile update`)
      }
    } catch (cacheError) {
      console.warn('Failed to clear match score cache after profile update:', cacheError)
      // Don't fail the request if cache clearing fails
    }

    return NextResponse.json({
      success: true,
      data: updatedProfile
    })
})

export const DELETE = asyncHandler(async () => {
  const { userId } = await auth()

  if (!userId) {
    throw commonErrors.unauthorized()
  }

  // Get user's organization and profile
  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { organization: true }
  })

  if (!user) {
    throw commonErrors.notFound('User')
  }

  const profile = await db.profile.findFirst({
    where: {
      organizationId: user.organizationId,
      deletedAt: null
    }
  })

  if (!profile) {
    throw commonErrors.notFound('Profile')
  }

  // Soft delete profile
  await db.profile.update({
    where: { id: profile.id },
    data: {
      deletedAt: new Date(),
      updatedById: user.id
    }
  })

  return NextResponse.json({
    success: true,
    message: 'Profile deleted successfully'
  })
})
