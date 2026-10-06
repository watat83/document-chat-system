import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

const samSyncSchema = z.object({
  uei: z.string().min(12).max(12),
  samData: z.object({
    entityName: z.string(),
    ueiSAM: z.string(),
    registrationStatus: z.string(),
    registrationDate: z.string(),
    expirationDate: z.string(),
    addressLine1: z.string(),
    city: z.string(),
    stateOrProvince: z.string(),
    zipCode: z.string(),
    cageCode: z.string(),
    entityType: z.string(),
    businessTypes: z.array(z.string()),
    naicsCodes: z.array(z.object({
      naicsCode: z.string(),
      isPrimary: z.boolean()
    }))
  })
})

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Rate limiting
    const rateLimitResult = await rateLimit(
      request, { maxRequests: 3, windowMs: 60 * 1000, keyGenerator: () => `sam-sync:${userId}` }
    )

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many sync attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Validate request body
    const body = await request.json()
    const validation = samSyncSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: validation.error.errors
        },
        { status: 400 }
      )
    }

    const { uei, samData } = validation.data

    // Get current user profile
    const user = await prisma.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    if (!['OWNER', 'ADMIN'].includes(user.role)) return NextResponse.json({ success: false, error: 'Organization administrator required' }, { status: 403 })
    if (uei !== samData.ueiSAM) return NextResponse.json({ success: false, error: 'UEI does not match imported data' }, { status: 400 })
    const profile = await prisma.profile.findFirst({ where: { organizationId: user.organizationId, deletedAt: null } })
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Parse business types for certifications
    const certifications = parseSAMCertifications(samData.businessTypes)

    // Extract NAICS codes
    const primaryNaics = samData.naicsCodes.find(code => code.isPrimary)?.naicsCode
    const secondaryNaics = samData.naicsCodes
      .filter(code => !code.isPrimary)
      .map(code => code.naicsCode)

    // Update profile with SAM.gov data
    const updatedProfile = await prisma.profile.update({
      where: { id: profile.id, organizationId: user.organizationId, deletedAt: null },
      data: {
        // Basic company information
        companyName: samData.entityName,
        uei: samData.ueiSAM,
        cageCode: samData.cageCode,

        // Address information
        addressLine1: samData.addressLine1,
        city: samData.city,
        state: samData.stateOrProvince,
        zipCode: samData.zipCode,

        // NAICS codes
        primaryNaics: primaryNaics || profile.primaryNaics,
        secondaryNaics: secondaryNaics.length > 0 ? secondaryNaics : profile.secondaryNaics,

        // Entity type and business information
        businessType: samData.entityType,
        updatedById: user.id,
        samGovData: { ...samData, provenance: 'user_supplied', verified: false },
        samGovSyncedAt: new Date(),

        // Certifications from business types
        certifications: {
          ...((profile.certifications as any) || {}),
          ...certifications,
          // Add SAM sync metadata
          _samSyncDate: new Date().toISOString(),
          _samRegistrationStatus: samData.registrationStatus,
          _samExpirationDate: samData.expirationDate
        },

        // Update profile metadata
        updatedAt: new Date()
      }
    })

    // Calculate new completeness score
    const completeness = calculateProfileCompleteness(updatedProfile)

    // Update completeness
    await prisma.profile.update({
      where: { id: updatedProfile.id, organizationId: user.organizationId, deletedAt: null },
      data: { profileCompleteness: completeness }
    })

    const responseProfile = {
      ...updatedProfile,
      profileCompleteness: completeness
    }

    return NextResponse.json({
      success: true,
      data: responseProfile,
      message: 'Profile updated with imported SAM.gov data'
    })

  } catch (error) {
    console.error('SAM sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to sync profile from SAM.gov' },
      { status: 500 }
    )
  }
}

// Helper function to parse SAM business types into certifications
function parseSAMCertifications(businessTypes: string[]) {
  const certifications: Record<string, boolean | any> = {}

  for (const businessType of businessTypes) {
    const type = businessType.toLowerCase()

    if (type.includes('small business')) {
      certifications.hasSmallBusiness = true
    }
    if (type.includes('8(a)') || type.includes('8a')) {
      certifications.has8a = true
    }
    if (type.includes('woman') && type.includes('owned')) {
      certifications.hasWosb = true
    }
    if (type.includes('service-disabled') && type.includes('veteran')) {
      certifications.hasSdvosb = true
    }
    if (type.includes('veteran') && !type.includes('service-disabled')) {
      certifications.hasVosb = true
    }
    if (type.includes('hubzone')) {
      certifications.hasHubzone = true
    }
    if (type.includes('minority') && type.includes('owned')) {
      certifications.hasMbe = true
    }
    if (type.includes('disadvantaged') && type.includes('business')) {
      certifications.hasSdb = true
    }
  }

  return certifications
}

// Profile completeness calculation - uses weighted approach like main API for consistency
function calculateProfileCompleteness(profile: any): number {
  const fields = [
    // Basic info (40% weight)
    { field: 'companyName', weight: 5 },
    { field: 'addressLine1', weight: 3 },
    { field: 'city', weight: 3 },
    { field: 'state', weight: 3 },
    { field: 'zipCode', weight: 3 },
    { field: 'country', weight: 2 },
    { field: 'primaryContactEmail', weight: 5 },
    { field: 'primaryContactName', weight: 3 },
    { field: 'primaryContactPhone', weight: 2 },
    { field: 'website', weight: 2 },
    { field: 'businessType', weight: 3 },
    { field: 'yearEstablished', weight: 2 },
    { field: 'employeeCount', weight: 2 },
    { field: 'annualRevenue', weight: 2 },

    // Government identifiers (20% weight)
    { field: 'uei', weight: 5 },
    { field: 'cageCode', weight: 5 },
    { field: 'duns', weight: 3 },
    { field: 'primaryNaics', weight: 7 },

    // Certifications (15% weight)
    { field: 'certifications', weight: 15 },

    // Capabilities and preferences (25% weight)
    { field: 'coreCompetencies', weight: 8 },
    { field: 'pastPerformance', weight: 5 },
    // Brand voice and tone removed from scoring - these are communication preferences, not profile completeness factors
    { field: 'organizationLevels', weight: 6 }, // Increased weight since brand preferences removed
    { field: 'geographicPreferences', weight: 6 } // Increased weight since brand preferences removed
  ]

  let completedWeight = 0

  fields.forEach(({ field, weight }) => {
    const value = profile[field]
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
