/**
 * Comprehensive TypeScript interfaces for Profile-related data structures
 * Replaces 'any' types with proper type safety for JSON fields
 */

export interface UserCertification {
  id?: string;
  certificationId: string;
  certificationNumber?: string;
  obtainedDate: string;
  expirationDate?: string;
  status: string;
  verificationStatus: string;
  documentUrl?: string;
  isActivated: boolean;
}

type BusinessType = 'Corporation' | 'LLC' | 'Partnership' | 'Sole Proprietorship' | 'Non-Profit' | 'Government Entity' | 'Other';
type EmployeeCount = '1-5' | '6-10' | '11-25' | '26-50' | '51-100' | '101-250' | '251-500' | '501-1000' | '1000+';
type AnnualRevenue = 'Less than $100K' | '$100K - $500K' | '$500K - $1M' | '$1M - $5M' | '$5M - $10M' | '$10M - $25M' | '$25M - $50M' | '$50M - $100M' | '$100M+';
type CustomerType = string;
type SecurityClearanceLevel = 'None' | 'Public Trust' | 'Secret' | 'Top Secret' | 'TS/SCI' | 'Not Required';

export type Profile = EnhancedProfile;

// =============================================
// PROFILE ENUMS WITH UI DISPLAY
// =============================================

export enum BrandVoice {
  PROFESSIONAL = 'PROFESSIONAL',
  FRIENDLY = 'FRIENDLY',
  TECHNICAL = 'TECHNICAL',
  AUTHORITATIVE = 'AUTHORITATIVE',
  CREATIVE = 'CREATIVE',
  COLLABORATIVE = 'COLLABORATIVE'
}

export enum BrandTone {
  FORMAL = 'FORMAL',
  CONVERSATIONAL = 'CONVERSATIONAL',
  DIRECT = 'DIRECT',
  COLLABORATIVE = 'COLLABORATIVE',
  CONSULTATIVE = 'CONSULTATIVE',
  RESULTS_DRIVEN = 'RESULTS_DRIVEN'
}

export enum GeographicPreferenceType {
  PREFERRED = 'PREFERRED',
  WILLING = 'WILLING',
  AVOID = 'AVOID'
}

export enum TravelWillingness {
  NONE = 'NONE',
  LOCAL = 'LOCAL',
  REGIONAL = 'REGIONAL',
  NATIONAL = 'NATIONAL',
  INTERNATIONAL = 'INTERNATIONAL'
}

export enum OrganizationLevel {
  FEDERAL = 'FEDERAL',
  STATE = 'STATE',
  LOCAL = 'LOCAL'
}

// UI Display Maps with Emojis
export const BRAND_VOICE_DISPLAY = {
  [BrandVoice.PROFESSIONAL]: {
    label: 'Professional',
    emoji: '🏢',
    description: 'Polished, corporate, and business-focused communication'
  },
  [BrandVoice.FRIENDLY]: {
    label: 'Friendly',
    emoji: '😊',
    description: 'Approachable, warm, and personable communication style'
  },
  [BrandVoice.TECHNICAL]: {
    label: 'Technical',
    emoji: '⚙️',
    description: 'Detail-oriented, precise, and expertise-driven communication'
  },
  [BrandVoice.AUTHORITATIVE]: {
    label: 'Authoritative',
    emoji: '🎯',
    description: 'Confident, expert, and leadership-focused communication'
  },
  [BrandVoice.CREATIVE]: {
    label: 'Creative',
    emoji: '🎨',
    description: 'Innovative, imaginative, and solution-oriented communication'
  },
  [BrandVoice.COLLABORATIVE]: {
    label: 'Collaborative',
    emoji: '🤝',
    description: 'Team-focused, partnership-oriented communication'
  }
} as const

export const BRAND_TONE_DISPLAY = {
  [BrandTone.FORMAL]: {
    label: 'Formal',
    emoji: '📋',
    description: 'Structured, traditional, and protocol-focused approach'
  },
  [BrandTone.CONVERSATIONAL]: {
    label: 'Conversational',
    emoji: '💬',
    description: 'Natural, engaging, and dialogue-focused communication'
  },
  [BrandTone.DIRECT]: {
    label: 'Direct',
    emoji: '🎯',
    description: 'Straightforward, clear, and no-nonsense communication'
  },
  [BrandTone.COLLABORATIVE]: {
    label: 'Collaborative',
    emoji: '🤝',
    description: 'Partnership-focused, team-oriented communication'
  },
  [BrandTone.CONSULTATIVE]: {
    label: 'Consultative',
    emoji: '💡',
    description: 'Advisory, strategic, and solution-focused approach'
  },
  [BrandTone.RESULTS_DRIVEN]: {
    label: 'Results-Driven',
    emoji: '📈',
    description: 'Performance-focused, outcome-oriented communication'
  }
} as const

export const GEOGRAPHIC_PREFERENCE_TYPE_DISPLAY = {
  [GeographicPreferenceType.PREFERRED]: {
    label: 'Preferred',
    emoji: '💚',
    description: 'Ideal locations for your business operations'
  },
  [GeographicPreferenceType.WILLING]: {
    label: 'Willing',
    emoji: '💛',
    description: 'Acceptable locations you would consider'
  },
  [GeographicPreferenceType.AVOID]: {
    label: 'Avoid',
    emoji: '❌',
    description: 'Locations to exclude from opportunities'
  }
} as const

export const TRAVEL_WILLINGNESS_DISPLAY = {
  [TravelWillingness.NONE]: {
    label: 'No Travel',
    emoji: '🏠',
    description: 'Local work only, no travel required'
  },
  [TravelWillingness.LOCAL]: {
    label: 'Local Travel',
    emoji: '🚗',
    description: 'Within city/metro area (under 50 miles)'
  },
  [TravelWillingness.REGIONAL]: {
    label: 'Regional Travel',
    emoji: '🚌',
    description: 'Within state/region (50-300 miles)'
  },
  [TravelWillingness.NATIONAL]: {
    label: 'National Travel',
    emoji: '✈️',
    description: 'Anywhere in the United States'
  },
  [TravelWillingness.INTERNATIONAL]: {
    label: 'International Travel',
    emoji: '🌍',
    description: 'Global opportunities including overseas work'
  }
} as const

export const GOVERNMENT_LEVEL_DISPLAY = {
  [OrganizationLevel.FEDERAL]: {
    label: 'Federal Government',
    emoji: '🏛️',
    description: 'Federal agencies and departments (DoD, GSA, HHS, etc.)',
    examples: ['Department of Defense', 'General Services Administration', 'Department of Homeland Security']
  },
  [OrganizationLevel.STATE]: {
    label: 'State Government',
    emoji: '🏢',
    description: 'State-level agencies and departments',
    examples: ['State Transportation Departments', 'State Health Agencies', 'State Education Departments']
  },
  [OrganizationLevel.LOCAL]: {
    label: 'Local Government',
    emoji: '🏘️',
    description: 'Cities, counties, municipalities, and local authorities',
    examples: ['City Councils', 'County Governments', 'School Districts', 'Public Utilities']
  }
} as const

// Utility Functions
export function getBrandVoiceDisplay(voice: BrandVoice | string) {
  return BRAND_VOICE_DISPLAY[voice as BrandVoice] || {
    label: voice,
    emoji: '❓',
    description: 'Custom brand voice'
  }
}

export function getBrandToneDisplay(tone: BrandTone | string) {
  return BRAND_TONE_DISPLAY[tone as BrandTone] || {
    label: tone,
    emoji: '❓',
    description: 'Custom communication tone'
  }
}

export function getGeographicPreferenceTypeDisplay(type: GeographicPreferenceType | string) {
  return GEOGRAPHIC_PREFERENCE_TYPE_DISPLAY[type as GeographicPreferenceType] || {
    label: type,
    emoji: '❓',
    description: 'Custom preference type'
  }
}

export function getTravelWillingnessDisplay(willingness: TravelWillingness | string) {
  return TRAVEL_WILLINGNESS_DISPLAY[willingness as TravelWillingness] || {
    label: willingness,
    emoji: '❓',
    description: 'Custom travel preference'
  }
}

export function getOrganizationLevelDisplay(level: OrganizationLevel | string) {
  return GOVERNMENT_LEVEL_DISPLAY[level as OrganizationLevel] || {
    label: level,
    emoji: '❓',
    description: 'Custom government level'
  }
}

// Array Helpers for UI Dropdowns
export const BRAND_VOICE_OPTIONS = Object.entries(BRAND_VOICE_DISPLAY).map(([value, display]) => ({
  value: value as BrandVoice,
  label: display.label,
  emoji: display.emoji,
  description: display.description
}))

export const BRAND_TONE_OPTIONS = Object.entries(BRAND_TONE_DISPLAY).map(([value, display]) => ({
  value: value as BrandTone,
  label: display.label,
  emoji: display.emoji,
  description: display.description
}))

export const GEOGRAPHIC_PREFERENCE_TYPE_OPTIONS = Object.entries(GEOGRAPHIC_PREFERENCE_TYPE_DISPLAY).map(([value, display]) => ({
  value: value as GeographicPreferenceType,
  label: display.label,
  emoji: display.emoji,
  description: display.description
}))

export const TRAVEL_WILLINGNESS_OPTIONS = Object.entries(TRAVEL_WILLINGNESS_DISPLAY).map(([value, display]) => ({
  value: value as TravelWillingness,
  label: display.label,
  emoji: display.emoji,
  description: display.description
}))

export const GOVERNMENT_LEVEL_OPTIONS = Object.entries(GOVERNMENT_LEVEL_DISPLAY).map(([value, display]) => ({
  value: value as OrganizationLevel,
  label: display.label,
  emoji: display.emoji,
  description: display.description,
  examples: display.examples
}))

// Enum Type Guards
export function isBrandVoice(value: string): value is BrandVoice {
  return Object.values(BrandVoice).includes(value as BrandVoice)
}

export function isBrandTone(value: string): value is BrandTone {
  return Object.values(BrandTone).includes(value as BrandTone)
}

export function isGeographicPreferenceType(value: string): value is GeographicPreferenceType {
  return Object.values(GeographicPreferenceType).includes(value as GeographicPreferenceType)
}

export function isTravelWillingness(value: string): value is TravelWillingness {
  return Object.values(TravelWillingness).includes(value as TravelWillingness)
}

export function isOrganizationLevel(value: string): value is OrganizationLevel {
  return Object.values(OrganizationLevel).includes(value as OrganizationLevel)
}

// =============================================
// PROFILE CERTIFICATIONS (LEGACY + NEW)
// =============================================

/**
 * Legacy certification structure for backward compatibility
 * @deprecated Use the new UserCertificationsProfile for new implementations
 */
export interface LegacyProfileCertifications {
  // Small Business Certifications
  has8a?: boolean
  eightAExpirationDate?: string

  hasHubZone?: boolean
  hubZoneExpirationDate?: string

  hasSdvosb?: boolean
  sdvosbExpirationDate?: string

  hasWosb?: boolean
  wosbExpirationDate?: string

  hasEdwosb?: boolean
  edwosbExpirationDate?: string

  hasVosb?: boolean
  vosbExpirationDate?: string

  hasSdb?: boolean
  sdbExpirationDate?: string

  // Other Certifications
  hasGSASchedule?: boolean
  gsaScheduleNumber?: string
  gsaScheduleExpirationDate?: string

  hasClearance?: boolean
  clearanceLevel?:
    | 'Public Trust'
    | 'Secret'
    | 'Top Secret'
    | 'Top Secret/SCI'
    | ''

  hasISO9001?: boolean
  iso9001ExpirationDate?: string

  hasCMMI?: boolean
  cmmiLevel?:
    | 'CMMI Level 1'
    | 'CMMI Level 2'
    | 'CMMI Level 3'
    | 'CMMI Level 4'
    | 'CMMI Level 5'
    | ''

  otherCertifications?: string

  // Set-Asides (independent of certifications)
  selectedSetAsides?: string[] // Array of set-aside codes the user wants to pursue
}

/**
 * Simplified certification structure - no legacy support
 */
export interface ProfileCertifications {
  // Simplified structure: only certifications and set-asides
  certifications: UserCertification[] // Array of user's certifications
  setAsides: string[] // Array of set-aside codes the user wants to pursue
}

// =============================================
// PAST PERFORMANCE
// =============================================

export interface KeyProject {
  id?: string
  title: string
  description?: string
  value?: number
  completedYear: number
  customerType?: CustomerType
  client?: string
  clientContactId?: string // Contact ID from contacts system
  contractId?: string // Future: Contract/Grant ID for fetching from government systems
  name?: string // Alternative field name used in some contexts
  completionYear?: number // Alternative field name used in some contexts

  // Enhanced fields for better profile enrichment and match scoring
  agency?: string // Government agency served (e.g., "Department of Defense", "GSA")
  naicsCode?: string // Primary NAICS code for this project
  secondaryNaicsCodes?: string[] // Additional NAICS codes if applicable
  pscCode?: string // Product Service Code
  contractType?: string // Contract type (FFP, CPFF, T&M, etc.)
  setAsideType?: string // Set-aside designation if applicable
  securityClearanceRequired?: string // Security clearance level required

  // Geographic information
  performanceLocation?: {
    city?: string
    state?: string
    country?: string
    zipCode?: string
    isRemote?: boolean // Was work performed remotely
  }

  // Contract details
  contractDuration?: string // Contract duration (1 year, 2 years, etc.)
  primeContractor?: boolean // Was this a prime contract (vs subcontract)
  subcontractorRole?: string // Role if subcontractor
  teamSize?: number // Size of team working on project

  // Performance metrics
  customerSatisfactionRating?: number // 1-5 rating if available
  awardFeeEarned?: number // Award fee earned if applicable

  // Key achievements
  keyAchievements?: string[] // Bullet points of major achievements
  technologiesUsed?: string[] // Technologies, tools, methodologies used
  certificationsMet?: string[] // Certifications required/met for this project
}

export interface ProfilePastPerformance {
  description?: string
  totalContractValue?: string
  yearsInBusiness?: string
  keyProjects?: KeyProject[]
}

// =============================================
// GEOGRAPHIC PREFERENCES
// =============================================

export interface GeographicPreference {
  id?: string
  type: GeographicPreferenceType | 'country' | 'state' | 'county' | 'city' | 'zip' // Preference level using enum
  name?: string // Display name of the location
  fullPath?: string // Full path for display (e.g., "Los Angeles, CA, USA")
  data?: any // Additional data from the location search
  zipCodes?: string[] // Specific zip codes
  cities?: string[] // Specific cities
  states?: string[] // State codes (e.g., ["CA", "NY", "TX"])
  countries?: string[] // Country codes (e.g., ["USA", "CAN"])
  regions?: string[] // Regional designations (e.g., ["West Coast", "Northeast", "Southeast"])
  radius?: number // Mile radius from business address
  notes?: string // Additional geographic notes
}

export interface GeographicPreferences {
  preferences: {
    country: GeographicPreference[]
    state: GeographicPreference[]
    county: GeographicPreference[]
    city: GeographicPreference[]
    zip: GeographicPreference[]
  }
  workFromHome: boolean // Can work remotely
  travelWillingness: TravelWillingness // Travel preference using enum
  maxTravelPercentage?: number // 0-100 percentage of time willing to travel
}

// =============================================
// PROFILE EMBEDDINGS
// =============================================

export interface ProfileEmbeddings {
  // Profile identification
  profileId: string // Reference to the source profile
  companyName: string // Human-readable company name
  organizationNamespace: string // Unique organization identifier (business name or organizationId)

  // Profile content chunks - minimal data stored in DB
  chunks: {
    id: string // Unique chunk ID (e.g., "profile123_chunk_0")
    chunkIndex: number // Sequential chunk number
    vectorId: string // Pinecone vector ID reference

    // Text position for attribution
    startChar: number // Start position in original text
    endChar: number // End position in original text

    // Content type for this chunk
    contentType: 'basic_info' | 'capabilities' | 'certifications' | 'past_performance' | 'naics' | 'combined' // Type of profile data in this chunk

    // Optional: Key terms for hybrid search
    keywords?: string[] // Main keywords from this chunk
  }[]

  // Processing metadata
  model: string // Embedding model used (e.g., "text-embedding-3-small")
  dimensions: number // Vector dimensions (e.g., 1536)
  totalChunks: number // Total number of chunks
  lastProcessed: string // ISO string - when embeddings were generated
}

// =============================================
// SAM.GOV DATA STRUCTURE
// =============================================

export interface SamGovRegistration {
  uei: string
  entityName: string
  dbaName?: string
  cageCode?: string

  // Address information
  address: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    stateOrProvinceCode?: string
    zipCode?: string
    countryCode: string
  }

  // Business information
  businessTypes?: string[]
  naicsCodes?: Array<{
    naicsCode: string
    naicsDescription: string
    isPrimary: boolean
  }>

  // Certifications from SAM.gov
  certifications?: {
    sba8a?: { certified: boolean; expirationDate?: string }
    hubzone?: { certified: boolean; expirationDate?: string }
    sdvosb?: { certified: boolean; expirationDate?: string }
    wosb?: { certified: boolean; expirationDate?: string }
    edwosb?: { certified: boolean; expirationDate?: string }
    sdb?: { certified: boolean }
  }

  // Registration details
  registrationStatus: 'Active' | 'Inactive' | 'Expired'
  registrationDate?: string
  expirationDate?: string
  lastUpdateDate?: string

  // Additional data
  purposeOfRegistration?: string[]
  businessStartDate?: string
  fiscalYearEndCloseDate?: string
}

// =============================================
// PROFILE ANALYTICS
// =============================================

export interface ProfileCompleteness {
  overall: number // 0-100
  sections: {
    basic: number
    contact: number
    business: number
    naics: number
    certifications: number
    capabilities: number
    pastPerformance: number
  }
  missingFields: string[]
  nextSteps: string[]
  scoreHistory: Array<{
    date: string
    score: number
    changes?: string[]
  }>
}

export interface ProfileAnalytics {
  viewCount: number
  matchCount: number
  applicationCount: number
  successRate: number // Percentage of applications that resulted in awards
  averageMatchScore: number

  // Performance over time
  monthlyStats: Array<{
    month: string
    views: number
    matches: number
    applications: number
    awards: number
  }>

  // Competitive analysis
  competitivePosition: {
    rank: number // Rank among similar companies
    percentile: number // 0-100
    benchmarkMetrics: {
      profileCompleteness: number
      certificationCount: number
      experienceYears: number
    }
  }

  // Recommendations
  recommendations: Array<{
    category: 'certification' | 'experience' | 'naics' | 'profile'
    priority: 'high' | 'medium' | 'low'
    title: string
    description: string
    estimatedImpact?: number // Estimated score improvement
  }>
}

export interface ProfileInsights {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]

  // Actionable insights
  quickWins: Array<{
    action: string
    effort: 'low' | 'medium' | 'high'
    impact: 'low' | 'medium' | 'high'
    estimatedTime: string
  }>

  // Market analysis
  marketPosition: {
    primaryMarkets: string[] // Main NAICS codes they compete in
    competitorCount: number
    marketSize: number // Estimated annual contract value in market
    marketShare: number // Estimated market share percentage
  }
}

// =============================================
// VALIDATION & ERRORS
// =============================================

export interface ProfileValidationError {
  message: string
  severity: 'error' | 'warning' | 'info'
  code: string
  path?: string[] // Path to the field that has the error
  suggestions?: string[]
}

export interface ValidationResult {
  isValid: boolean
  score: number // 0-100
  errors: ProfileValidationError[]
  warnings: ProfileValidationError[]
  suggestions: ProfileValidationError[]
  validatedAt: string
  validationVersion: string
}

// =============================================
// PROFILE STATE & CACHE
// =============================================

export interface ProfileCache {
  data: any
  timestamp: number
  ttl: number
  version: string
}

export interface ProfileOptimisticUpdate {
  id: string
  changes: Record<string, any>
  timestamp: number
  applied: boolean
}

// =============================================
// ENHANCED PROFILE INTERFACE
// =============================================

export interface EnhancedProfile {
  id: string
  organizationId: string
  createdById: string
  updatedById?: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date

  // Company Information
  companyName: string
  dbaName?: string
  uei?: string
  duns?: string
  cageCode?: string

  // Business Address
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  zipCode?: string
  country: string

  // Contact Information
  primaryContactName?: string
  primaryContactEmail?: string
  primaryContactPhone?: string
  website?: string

  // Profile Images
  logoUrl?: string
  bannerUrl?: string
  contactProfileImageUrl?: string

  // Business Classification
  businessType?: BusinessType
  yearEstablished?: number
  employeeCount?: EmployeeCount
  annualRevenue?: AnnualRevenue

  // NAICS Codes
  primaryNaics?: string
  secondaryNaics?: string[]

  // Certifications - Now properly typed
  certifications?: ProfileCertifications

  // Capabilities and Experience
  coreCompetencies?: string[]
  pastPerformance?: ProfilePastPerformance // Now properly typed
  securityClearance?: SecurityClearanceLevel

  // Brand Voice and Communication
  brandVoice?: BrandVoice // Brand voice using enum
  brandTone?: BrandTone // Communication tone using enum

  // Geographic and Government Level Preferences
  geographicPreferences?: GeographicPreferences // Preferred geographic markets
  organizationLevels?: OrganizationLevel[] // Target government levels using enum

  // System fields
  profileCompleteness: number // Percentage 0-100
  samGovSyncedAt?: Date
  samGovData?: SamGovRegistration // Now properly typed

  // Profile vectorization for AI matching
  profileEmbeddings?: ProfileEmbeddings // Profile embedding vectors for intelligent matching

  // Enhanced analytics (when populated)
  analytics?: ProfileAnalytics
  insights?: ProfileInsights
  completeness?: ProfileCompleteness

  // Relations (when populated)
  organization?: any // Will be typed separately
  createdBy?: any // Will be typed separately
  updatedBy?: any // Will be typed separately
}

// =============================================
// TYPE GUARDS
// =============================================

export function isProfileCertifications(
  obj: any
): obj is ProfileCertifications {
  return obj && typeof obj === 'object'
}

export function isProfilePastPerformance(
  obj: any
): obj is ProfilePastPerformance {
  return obj && typeof obj === 'object'
}

export function isKeyProject(obj: any): obj is KeyProject {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.title === 'string' &&
    typeof obj.completedYear === 'number'
  )
}

export function isSamGovRegistration(obj: any): obj is SamGovRegistration {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.uei === 'string' &&
    typeof obj.entityName === 'string'
  )
}

// =============================================
// HELPER FUNCTIONS
// =============================================

export function validateCertificationDate(dateString?: string): boolean {
  if (!dateString) return true
  const date = new Date(dateString)
  const today = new Date()
  return date > today
}

export function calculateCertificationScore(
  certifications?: ProfileCertifications
): number {
  if (!certifications) return 0

  const certTypes = [
    'has8a',
    'hasHubZone',
    'hasSdvosb',
    'hasWosb',
    'hasEdwosb',
    'hasVosb',
    'hasSdb',
    'hasGSASchedule',
    'hasClearance',
    'hasISO9001',
    'hasCMMI',
  ]

  const activeCerts = certTypes.filter(
    (cert) => certifications[cert as keyof ProfileCertifications]
  )
  return Math.min(100, (activeCerts.length / certTypes.length) * 100)
}

export function calculatePastPerformanceScore(
  pastPerformance?: ProfilePastPerformance
): number {
  if (!pastPerformance) return 0

  let score = 0

  // Description
  if (pastPerformance.description && pastPerformance.description.length > 50) {
    score += 30
  }

  // Total contract value
  if (pastPerformance.totalContractValue) {
    score += 20
  }

  // Years in business
  if (pastPerformance.yearsInBusiness) {
    score += 20
  }

  // Key projects
  if (pastPerformance.keyProjects && pastPerformance.keyProjects.length > 0) {
    score += Math.min(30, pastPerformance.keyProjects.length * 10)
  }

  return Math.min(100, score)
}

export function getNextProfileSteps(profile: EnhancedProfile): string[] {
  const steps: string[] = []

  if (!profile.uei) {
    steps.push('Add UEI (Unique Entity Identifier) for government contracting')
  }

  if (!profile.primaryNaics) {
    steps.push('Set primary NAICS code to improve opportunity matching')
  }

  if (
    !profile.certifications ||
    Object.keys(profile.certifications).length === 0
  ) {
    steps.push('Add relevant certifications (8(a), HUBZone, SDVOSB, etc.)')
  }

  if (!profile.coreCompetencies || profile.coreCompetencies.length === 0) {
    steps.push('Define core competencies and capabilities')
  }

  if (
    !profile.pastPerformance?.keyProjects ||
    profile.pastPerformance.keyProjects.length === 0
  ) {
    steps.push('Add key project examples to showcase experience')
  }

  return steps
}
