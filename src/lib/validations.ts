import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import {
  BrandVoice,
  BrandTone,
  OrganizationLevel,
  TravelWillingness,
  GeographicPreferenceType
} from '@/types/profile'

// Security validation helpers
const sanitizeString = (str: string) => {
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

const sanitizeRichText = (str: string) => {
  // Allow safe HTML tags for rich text content (PlateEditor)
  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'span', 'div'
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'src', 'alt', 'width', 'height', 'class'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })
}

const createSafeString = (minLength: number = 0, maxLength: number = 255) => {
  return z
    .string()
    .min(minLength)
    .max(maxLength)
    .describe(
      `Sanitized string field with length between ${minLength} and ${maxLength} characters. Automatically sanitized for XSS prevention and validated against malicious patterns.`
    )
    .transform(sanitizeString)
    .refine((val) => {
      // Check for potential XSS patterns
      const xssPattern =
        /<script[^>]*>|javascript:|on\w+\s*=|<iframe|<object|<embed/i
      return !xssPattern.test(val)
    }, 'Invalid characters detected')
}

const createSafeOptionalString = (maxLength: number = 255) => {
  return z
    .string()
    .max(maxLength)
    .optional()
    .describe(
      `Optional sanitized string field with maximum length of ${maxLength} characters. Automatically sanitized for XSS prevention when provided.`
    )
    .transform((val) => (val ? sanitizeString(val) : val))
    .refine((val) => {
      if (!val) return true
      const xssPattern =
        /<script[^>]*>|javascript:|on\w+\s*=|<iframe|<object|<embed/i
      return !xssPattern.test(val)
    }, 'Invalid characters detected')
}

const createSafeRichTextString = (maxLength: number = 255) => {
  return z
    .string()
    .max(maxLength)
    .optional()
    .describe(
      `Optional rich text field with maximum length of ${maxLength} characters. Allows safe HTML formatting tags (bold, italic, headings, lists, links, images) while preventing XSS attacks.`
    )
    .transform((val) => (val ? sanitizeRichText(val) : val))
    .refine((val) => {
      if (!val) return true
      // Check for potential XSS patterns that might bypass DOMPurify
      const xssPattern =
        /<script[^>]*>|javascript:|on\w+\s*=|<iframe|<object|<embed/i
      return !xssPattern.test(val)
    }, 'Invalid characters detected')
}

// Unused but maintained for potential future use
// const createSafeEmail = () => {
//   return z.string()
//     .email('Invalid email format')
//     .max(320) // RFC 5321 limit
//     .describe("Validated email address field with RFC 5321 compliance (max 320 characters). Automatically normalized to lowercase and trimmed, with additional security validation against suspicious characters.")
//     .transform(val => val.toLowerCase().trim())
//     .refine(val => {
//       // Additional email security checks
//       const suspiciousPattern = /[<>"'&\\]/
//       return !suspiciousPattern.test(val)
//     }, 'Invalid email format')
// }

const createSafeUrl = () => {
  return z
    .string()
    .url('Invalid URL format')
    .max(2048) // Common URL length limit
    .describe(
      'Validated URL field with maximum length of 2048 characters. Only HTTP/HTTPS protocols are allowed. Automatically validated against suspicious protocols (javascript:, data:, etc.) for security.'
    )
    .refine((val) => {
      // Only allow http/https protocols
      return /^https?:\/\//i.test(val)
    }, 'Only HTTP/HTTPS URLs are allowed')
    .refine((val) => {
      // Block suspicious patterns
      const suspiciousPattern = /javascript:|data:|vbscript:|file:|ftp:/i
      return !suspiciousPattern.test(val)
    }, 'Suspicious URL detected')
}

// User validation schemas
export const UserUpdateSchema = z
  .object({
    firstName: createSafeOptionalString(100)
      .refine((val) => !val || val.length >= 1, 'First name is required')
      .describe(
        "User's first name. Optional field with maximum 100 characters. Automatically sanitized for security."
      ),
    lastName: createSafeOptionalString(100)
      .refine((val) => !val || val.length >= 1, 'Last name is required')
      .describe(
        "User's last name. Optional field with maximum 100 characters. Automatically sanitized for security."
      ),
    timezone: z
      .string()
      .max(50)
      .optional()
      .refine((val) => {
        if (!val) return true
        // Validate timezone format (e.g., America/New_York)
        return /^[A-Z][a-zA-Z_]*\/[A-Z][a-zA-Z_]*$/.test(val)
      }, 'Invalid timezone format')
      .describe(
        "User's timezone in standard format (e.g., 'America/New_York'). Optional field with maximum 50 characters. Must follow standard timezone naming convention."
      ),
    emailOptIn: z
      .boolean()
      .optional()
      .describe(
        "User's email notification preference. Optional boolean indicating whether user wants to receive email notifications and updates."
      ),
  })
  .partial()
  .describe(
    'Schema for updating user profile information. All fields are optional and will be validated and sanitized for security.'
  )

// Profile validation schemas
export const ProfileCreateSchema = z
  .object({
    companyName: z
      .string()
      .min(1, 'Company name is required')
      .describe(
        'Company name for the contractor profile. Required field with minimum 1 character. This is the primary identifier for the business entity.'
      ),
    profileCompleteness: z
      .number()
      .default(10)
      .describe(
        'Profile completion percentage score. Defaults to 10% for new profiles. Automatically calculated based on filled fields and used for matching algorithms.'
      ),
  })
  .describe(
    'Schema for creating a new contractor profile. Establishes the basic company information and initial completion score.'
  )

export const ProfileUpdateSchema = z
  .object({
    // Basic company information
    companyName: z
      .string()
      .min(1)
      .max(300)
      .optional()
      .or(z.literal(''))
      .describe(
        "Company's legal name. Optional field with 1-300 characters. Used for official identification and matching with government databases."
      ),
    dbaName: z
      .string()
      .max(300)
      .optional()
      .or(z.literal(''))
      .describe(
        "'Doing Business As' name if different from legal company name. Optional field with maximum 300 characters. Used for marketing and public-facing identification."
      ),
    uei: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val.trim() === '') return true
        // UEI must be exactly 12 alphanumeric characters
        return /^[A-Z0-9]{12}$/.test(val)
      }, 'UEI must be exactly 12 alphanumeric characters when provided')
      .describe(
        'Unique Entity Identifier (UEI) - 12 alphanumeric characters. Required for government contracting since April 2022, replacing DUNS. Format: ABCD1234EFGH.'
      ),
    duns: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val.trim() === '') return true
        // DUNS must be exactly 9 digits
        return /^\d{9}$/.test(val)
      }, 'DUNS must be exactly 9 digits when provided')
      .describe(
        'Data Universal Numbering System (DUNS) number - 9 digits. Legacy identifier being phased out in favor of UEI. Format: 123456789.'
      ),
    cageCode: z
      .string()
      .max(5)
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val.trim() === '') return true
        // CAGE code must be 5 alphanumeric characters
        return /^[A-Z0-9]{5}$/.test(val)
      }, 'CAGE code must be 5 alphanumeric characters when provided')
      .describe(
        'Commercial and Government Entity (CAGE) code - 5 alphanumeric characters. Used for identifying contractor facilities. Format: A1B2C.'
      ),

    // Address
    addressLine1: z
      .string()
      .max(255)
      .optional()
      .or(z.literal(''))
      .describe(
        "Company's primary address line (street number, street name). Optional field with maximum 255 characters. Used for official business location and contract delivery."
      ),
    addressLine2: z
      .string()
      .max(255)
      .optional()
      .or(z.literal(''))
      .describe(
        "Company's secondary address line (apartment, suite, floor). Optional field with maximum 255 characters. Used for additional location details."
      ),
    city: z
      .string()
      .max(100)
      .optional()
      .or(z.literal(''))
      .describe(
        "Company's city location. Optional field with maximum 100 characters. Used for geographic matching and local contracting opportunities."
      ),
    state: z
      .string()
      .length(2, 'State must be 2-letter code')
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        // Validate against list of US state codes
        const validStates = [
          'AL',
          'AK',
          'AZ',
          'AR',
          'CA',
          'CO',
          'CT',
          'DE',
          'FL',
          'GA',
          'HI',
          'ID',
          'IL',
          'IN',
          'IA',
          'KS',
          'KY',
          'LA',
          'ME',
          'MD',
          'MA',
          'MI',
          'MN',
          'MS',
          'MO',
          'MT',
          'NE',
          'NV',
          'NH',
          'NJ',
          'NM',
          'NY',
          'NC',
          'ND',
          'OH',
          'OK',
          'OR',
          'PA',
          'RI',
          'SC',
          'SD',
          'TN',
          'TX',
          'UT',
          'VT',
          'VA',
          'WA',
          'WV',
          'WI',
          'WY',
          'DC',
        ]
        return validStates.includes(val.toUpperCase())
      }, 'Invalid state code')
      .describe(
        "Company's state location using 2-letter state code (e.g., 'CA', 'TX', 'NY'). Optional field validated against official US state codes including DC."
      ),
    zipCode: z
      .string()
      .max(10, 'ZIP code cannot exceed 10 characters')
      .regex(/^[\d-]*$/, 'ZIP code can only contain numbers and hyphens')
      .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format (use 12345 or 12345-6789)')
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        // Only allow numbers and hyphens, then validate format
        return /^[\d-]*$/.test(val) && /^\d{5}(-\d{4})?$/.test(val)
      }, 'ZIP code can only contain numbers and hyphens in format 12345 or 12345-6789')
      .describe(
        "Company's ZIP code in standard format (12345 or 12345-6789). Maximum 10 characters including hyphens. Only numbers and hyphens allowed. Optional field validated against US ZIP code format. Used for geographic matching and local opportunities."
      ),
    country: z
      .string()
      .max(100)
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        // Allow common country names
        const validCountries = [
          'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany',
          'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland',
          'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'New Zealand',
          'Japan', 'South Korea', 'Singapore', 'Other'
        ]
        return validCountries.includes(val)
      }, 'Please select a valid country from the list')
      .describe(
        "Company's country location. Optional field with predefined country options. Used for international contracting opportunities and geographic matching. Defaults to 'United States' for most government contractors."
      ),

    // Contact information
    primaryContactName: z
      .string()
      .max(100)
      .optional()
      .or(z.literal(''))
      .describe(
        'Name of the primary contact person for the company. Optional field with maximum 100 characters. Used for contract communication and relationship management.'
      ),
    primaryContactEmail: z
      .string()
      .email('Invalid email format')
      .optional()
      .or(z.literal(''))
      .describe(
        'Email address of the primary contact person. Optional field with email format validation. Used for contract notifications and communication.'
      ),
    primaryContactPhone: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true

        // Allow any reasonable phone number format - let the react-phone-number-input library handle validation
        // Accept digits, spaces, hyphens, parentheses, periods, and plus signs
        const validCharacters = /^[\+]?[\d\s\-\(\)\.]{7,25}$/.test(val)
        if (!validCharacters) return false

        // Extract digits only for length check
        const digitsOnly = val.replace(/[^\d]/g, '')

        // Be flexible with international numbers - some countries have shorter numbers
        // Minimum 7 digits (like some European numbers), maximum 15 digits (ITU-T E.164 standard)
        return digitsOnly.length >= 7 && digitsOnly.length <= 15
      }, 'Please enter a valid phone number (7-15 digits)')
      .describe(
        'Phone number of the primary contact person. Optional field supporting international formats. Accepts various formats including +1-234-567-8900, (234) 567-8900, +44 20 7946 0958, etc. Must contain 7-15 digits to accommodate different countries.'
      ),
    website: createSafeUrl()
      .optional()
      .or(z.literal(''))
      .describe(
        'Company website URL. Optional field with URL validation. Must use HTTP/HTTPS protocol. Used for company verification and additional information.'
      ),

    // Profile Images
    logoUrl: createSafeUrl()
      .optional()
      .or(z.literal(''))
      .describe(
        'Company logo image URL. Optional field with URL validation. Must use HTTP/HTTPS protocol. Used for company branding and display in profile and proposals.'
      ),
    bannerUrl: createSafeUrl()
      .optional()
      .or(z.literal(''))
      .describe(
        'Company banner/header image URL. Optional field with URL validation. Must use HTTP/HTTPS protocol. Used for enhanced profile display and branding.'
      ),
    contactProfileImageUrl: createSafeUrl()
      .optional()
      .or(z.literal(''))
      .describe(
        'Primary contact profile image URL. Optional field with URL validation. Must use HTTP/HTTPS protocol. Used for personalizing contact communications.'
      ),

    // Business details
    businessType: z
      .enum([
        'Corporation',
        'LLC',
        'Partnership',
        'Sole Proprietorship',
        'Non-Profit',
        'Government Entity',
        'Other',
      ])
      .optional()
      .describe(
        'Legal structure of the business entity. Optional field with predefined options. Used for qualification determination and set-aside matching.'
      ),
    yearEstablished: z
      .number()
      .min(1800)
      .max(new Date().getFullYear())
      .optional()
      .describe(
        `Year the company was established. Optional field with range from 1800 to current year (${new Date().getFullYear()}). Used for experience evaluation and past performance assessment.`
      ),
    employeeCount: z
      .enum([
        '1-5',
        '6-10',
        '11-25',
        '26-50',
        '51-100',
        '101-250',
        '251-500',
        '501-1000',
        '1000+',
      ])
      .optional()
      .describe(
        'Number of employees in the company using predefined ranges. Optional field used for small business qualification and capacity assessment.'
      ),
    annualRevenue: z
      .enum([
        'Less than $100K',
        '$100K - $500K',
        '$500K - $1M',
        '$1M - $5M',
        '$5M - $10M',
        '$10M - $25M',
        '$25M - $50M',
        '$50M - $100M',
        '$100M+',
      ])
      .optional()
      .describe(
        "Company's annual revenue using predefined ranges. Optional field used for financial capacity assessment and size standard determination."
      ),

    // NAICS codes
    primaryNaics: z
      .string()
      .regex(/^\d{6}$/, 'NAICS code must be 6 digits')
      .optional()
      .or(z.literal(''))
      .describe(
        'Primary North American Industry Classification System (NAICS) code - 6 digits. Optional field used for industry classification and opportunity matching. Format: 541511.'
      ),
    secondaryNaics: z
      .array(z.string().regex(/^\d{6}$/, 'NAICS code must be 6 digits'))
      .max(10, 'Maximum 10 secondary NAICS codes allowed')
      .optional()
      .describe(
        'Additional NAICS codes representing secondary business activities. Optional array of up to 10 6-digit codes used for broader opportunity matching and capability demonstration.'
      ),

    // SAM.gov Data - Optional structured data from government registration
    samGovData: z
      .object({
        uei: z
          .string()
          .regex(/^[A-Z0-9]{12}$/, 'UEI must be 12 alphanumeric characters')
          .describe(
            'Unique Entity Identifier from SAM.gov registration. 12 alphanumeric characters.'
          ),
        entityName: z
          .string()
          .min(1)
          .describe('Legal entity name as registered in SAM.gov.'),
        dbaName: z
          .string()
          .optional()
          .describe('Doing Business As name from SAM.gov registration.'),
        cageCode: z
          .string()
          .regex(/^[A-Z0-9]{5}$/)
          .optional()
          .describe('Commercial and Government Entity code from SAM.gov.'),
        address: z
          .object({
            addressLine1: z.string().optional(),
            addressLine2: z.string().optional(),
            city: z.string().optional(),
            stateOrProvinceCode: z.string().optional(),
            zipCode: z.string().max(10, 'ZIP code cannot exceed 10 characters').optional(),
            countryCode: z
              .string()
              .describe('Country code from SAM.gov address'),
          })
          .describe('Business address from SAM.gov registration'),
        businessTypes: z
          .array(z.string())
          .optional()
          .describe('Business type classifications from SAM.gov.'),
        naicsCodes: z
          .array(
            z.object({
              naicsCode: z.string().regex(/^\d{6}$/),
              naicsDescription: z.string(),
              isPrimary: z.boolean(),
            })
          )
          .optional()
          .describe('NAICS codes with descriptions from SAM.gov'),
        certifications: z
          .object({
            sba8a: z
              .object({
                certified: z.boolean(),
                expirationDate: z.string().optional(),
              })
              .optional(),
            hubzone: z
              .object({
                certified: z.boolean(),
                expirationDate: z.string().optional(),
              })
              .optional(),
            sdvosb: z
              .object({
                certified: z.boolean(),
                expirationDate: z.string().optional(),
              })
              .optional(),
            wosb: z
              .object({
                certified: z.boolean(),
                expirationDate: z.string().optional(),
              })
              .optional(),
            edwosb: z
              .object({
                certified: z.boolean(),
                expirationDate: z.string().optional(),
              })
              .optional(),
            sdb: z.object({ certified: z.boolean() }).optional(),
          })
          .optional()
          .describe('Certifications from SAM.gov registration'),
        registrationStatus: z
          .enum(['Active', 'Inactive', 'Expired'])
          .describe('Current registration status in SAM.gov'),
        registrationDate: z
          .string()
          .optional()
          .describe('Date of SAM.gov registration'),
        expirationDate: z
          .string()
          .optional()
          .describe('SAM.gov registration expiration date'),
        lastUpdateDate: z
          .string()
          .optional()
          .describe('Last update date in SAM.gov'),
        purposeOfRegistration: z
          .array(z.string())
          .optional()
          .describe('Purpose of registration from SAM.gov'),
        businessStartDate: z
          .string()
          .optional()
          .describe('Business start date from SAM.gov'),
        fiscalYearEndCloseDate: z
          .string()
          .optional()
          .describe('Fiscal year end date from SAM.gov'),
      })
      .optional()
      .describe(
        'Structured SAM.gov registration data properly typed to match SamGovRegistration interface. Automatically synchronized from government databases.'
      ),

    // Certifications - Enhanced to support both legacy and new comprehensive system
    certifications: z
      .object({
        // Legacy certification data (for backward compatibility)
        legacy: z
          .object({
            // Small Business Certifications
            has8a: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has 8(a) Business Development certification. SBA program for socially and economically disadvantaged small businesses.'
              ),
            eightAExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for 8(a) certification in ISO date format. Must be a future date. 8(a) certification lasts up to 9 years with annual reviews.'
              ),

            hasHubZone: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Historically Underutilized Business Zone (HUBZone) certification. SBA program for businesses in underutilized areas.'
              ),
            hubZoneExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for HUBZone certification in ISO date format. Must be a future date.'
              ),

            hasSdvosb: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Service-Disabled Veteran-Owned Small Business (SDVOSB) certification. VA program for veteran-owned businesses.'
              ),
            sdvosbExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for SDVOSB certification in ISO date format. Must be a future date.'
              ),

            hasWosb: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Women-Owned Small Business (WOSB) certification. SBA program for women-owned businesses.'
              ),
            wosbExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for WOSB certification in ISO date format. Must be a future date.'
              ),

            hasEdwosb: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Economically Disadvantaged Women-Owned Small Business (EDWOSB) certification. SBA program for economically disadvantaged women-owned businesses.'
              ),
            edwosbExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for EDWOSB certification in ISO date format. Must be a future date.'
              ),

            hasVosb: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Veteran-Owned Small Business (VOSB) certification. VA program for veteran-owned businesses.'
              ),
            vosbExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for VOSB certification in ISO date format. Must be a future date.'
              ),

            hasSdb: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Small Disadvantaged Business (SDB) certification. SBA program for socially and economically disadvantaged businesses.'
              ),
            sdbExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for SDB certification in ISO date format. Must be a future date.'
              ),

            // Other Certifications
            hasGSASchedule: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has GSA Schedule contract. Pre-negotiated contract vehicle for government purchasing.'
              ),
            gsaScheduleNumber: createSafeOptionalString(20)
              .or(z.literal(''))
              .optional()
              .describe(
                'GSA Schedule contract number (e.g., GS-35F-1234H). Maximum 20 characters.'
              ),
            gsaScheduleExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for GSA Schedule in ISO date format. Must be a future date.'
              ),

            hasClearance: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has security clearance capability. Required for classified government work.'
              ),
            clearanceLevel: z
              .union([
                z.enum(['Public Trust', 'Secret', 'Top Secret', 'Top Secret/SCI']),
                z.literal(''),
              ])
              .optional()
              .describe(
                'Highest security clearance level available. Used for matching classified opportunities.'
              ),

            hasISO9001: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has ISO 9001 quality management certification. International standard for quality management systems.'
              ),
            iso9001ExpirationDate: z
              .string()
              .optional()
              .or(z.literal(''))
              .refine((val) => {
                if (!val || val === '') return true
                const date = new Date(val)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return date > today
              }, 'Expiration date must be in the future')
              .describe(
                'Expiration date for ISO 9001 certification in ISO date format. Must be a future date.'
              ),

            hasCMMI: z
              .boolean()
              .optional()
              .describe(
                'Indicates if company has Capability Maturity Model Integration (CMMI) certification. Process improvement framework for software development.'
              ),
            cmmiLevel: z
              .union([
                z.enum([
                  'CMMI Level 1',
                  'CMMI Level 2',
                  'CMMI Level 3',
                  'CMMI Level 4',
                  'CMMI Level 5',
                ]),
                z.literal(''),
              ])
              .optional()
              .describe(
                'CMMI maturity level achieved. Higher levels indicate more mature and optimized processes.'
              ),

            otherCertifications: createSafeOptionalString(1000)
              .or(z.literal(''))
              .optional()
              .describe(
                'Additional certifications not covered above. Free text field with maximum 1000 characters.'
              ),

          })
          .optional()
          .describe(
            'Legacy certification data structure. Maintained for backward compatibility with existing profiles.'
          ),

        // New comprehensive certification system
        comprehensive: z
          .object({
            certifications: z
              .array(
                z.object({
                  id: z.string().optional().describe('Unique certification record ID'),
                  certificationId: z.string().min(1).describe('Government certification definition ID'),
                  certificationNumber: createSafeOptionalString(100).describe('User certification number'),
                  obtainedDate: z.string().datetime().describe('Date certification was obtained'),
                  expirationDate: z.string().datetime().optional().describe('Certification expiration date'),
                  status: z.enum(['active', 'pending', 'expired', 'suspended', 'revoked']).describe('Certification status'),
                  verificationStatus: z.enum(['pending', 'verified', 'rejected', 'not_required']).describe('Verification status'),
                  documentUrl: createSafeUrl().optional().describe('URL to certification document'),
                  issuingOffice: createSafeOptionalString(200).describe('Issuing office location'),
                  notes: createSafeOptionalString(1000).describe('Additional notes'),
                  isActivated: z.boolean().default(true).describe('Whether certification is activated for matching'),
                  reminderSettings: z
                    .object({
                      enabled: z.boolean().describe('Enable expiration reminders'),
                      reminderDays: z
                        .array(z.number().positive().max(365))
                        .min(1)
                        .max(10)
                        .describe('Days before expiration to send reminders'),
                    })
                    .optional()
                    .describe('Reminder settings for expiration'),
                  createdAt: z.string().datetime().describe('Record creation timestamp'),
                  updatedAt: z.string().datetime().describe('Record update timestamp'),
                })
              )
              .max(100)
              .describe('Array of user certifications'),
            lastUpdated: z.string().datetime().describe('Profile last updated timestamp'),
            completenessScore: z.number().min(0).max(100).describe('Certification completeness score'),
            stats: z
              .object({
                total: z.number().min(0).describe('Total certifications'),
                active: z.number().min(0).describe('Active certifications'),
                expiringSoon: z.number().min(0).describe('Certifications expiring within 90 days'),
                expired: z.number().min(0).describe('Expired certifications'),
                pending: z.number().min(0).describe('Pending certifications'),
                verified: z.number().min(0).describe('Verified certifications'),
              })
              .describe('Certification statistics'),
          })
          .optional()
          .describe(
            'New comprehensive certification system with full tracking and management capabilities.'
          ),


        // Certifications array
        certifications: z
          .array(z.any())
          .max(100, 'Too many certifications selected (max 100)')
          .optional()
          .describe(
            'Array of user certifications. Each certification contains complete tracking data including status, dates, and verification information.'
          ),
        // Set-asides array (renamed for consistency)
        setAsides: z
          .array(z.string())
          .max(20, 'Too many set-asides selected (max 20)')
          .optional()
          .describe(
            'Array of set-aside codes the user wants to pursue. References set-aside IDs from the government set-asides database.'
          ),

        // Migration status
        migrationStatus: z
          .enum(['legacy', 'migrating', 'comprehensive'])
          .optional()
          .describe(
            'Migration status indicating which certification system is being used. Legacy for old data, comprehensive for new system.'
          ),
      })
      .optional()
      .describe(
        'Enhanced company certifications system supporting both legacy and comprehensive certification management. Used for set-aside opportunity matching and qualification verification.'
      ),

    // Capabilities
    coreCompetencies: z
      .array(createSafeString(1, 150))
      .max(25, 'Too many competencies (max 25)')
      .optional()
      .describe(
        "List of company's core competencies and skills. Maximum 25 items, each 1-150 characters. Used for capability-based opportunity matching and technical evaluation."
      ),
    competencyDetails: z
      .array(
        z.object({
          pscCode: z.string().describe('PSC code (unique identifier) for the competency'),
          competencyName: z.string().describe('Human-readable name of the competency'),
          level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).describe('Proficiency level for this competency'),
          categoryId: z.string().describe('Category this competency belongs to'),
          categoryName: z.string().describe('Human-readable category name')
        })
      )
      .max(25, 'Too many detailed competencies (max 25)')
      .optional()
      .describe(
        "Detailed competency information including skill levels. Maximum 25 items. Provides enhanced matching capabilities beyond basic competency names."
      ),
    securityClearance: z
      .enum([
        'None',
        'Public Trust',
        'Secret',
        'Top Secret',
        'TS/SCI',
        'Not Required',
      ])
      .optional()
      .describe(
        'Highest security clearance level available within the company. Used for matching opportunities requiring specific clearance levels.'
      ),
    pastPerformance: z
      .object({
        description: createSafeRichTextString(3000).describe(
          "General description of company's past performance and experience. Maximum 3000 characters with rich text formatting support. Used for qualification assessment and capability demonstration."
        ),
        totalContractValue: createSafeOptionalString(100).describe(
          "Total contract value across all projects (e.g., '$5M', '$1.2B'). Maximum 100 characters. Used for demonstrating company's contract capacity."
        ),
        yearsInBusiness: createSafeOptionalString(10).describe(
          'Number of years the company has been in business. Maximum 10 characters. Used for demonstrating company stability and experience.'
        ),
        keyProjects: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe(
                  'Unique identifier for the project. Optional field used for project tracking and updates.'
                ),
              title: createSafeString(1, 200).describe(
                'Project title or name. 1-200 characters. Used to identify and showcase specific project experience.'
              ),
              description: createSafeRichTextString(2000).describe(
                'Detailed project description including scope, deliverables, and outcomes. Maximum 2000 characters with rich text formatting support. Used for technical evaluation and capability assessment.'
              ),
              value: z
                .number()
                .positive()
                .max(999999999999, 'Value too large')
                .optional()
                .describe(
                  'Contract value in US dollars. Maximum $9.99 trillion. Used for demonstrating experience with similar-sized contracts.'
                ),
              completedYear: z
                .number()
                .min(1990)
                .max(new Date().getFullYear())
                .describe(
                  `Year the project was completed. Range: 1990 to current year (${new Date().getFullYear()}). Used for demonstrating recent and relevant experience.`
                ),
              customerType: z
                .enum(['Federal', 'State', 'Local', 'Commercial'])
                .optional()
                .describe(
                  'Type of customer or client. Used for matching opportunities with similar customer types and understanding market experience.'
                ),
              client: createSafeOptionalString(200).describe(
                'Client or customer organization name. Maximum 200 characters. Used for reference verification and market credibility.'
              ),
              clientContactId: createSafeOptionalString(30).describe(
                'Contact ID from CRM for the client contact associated with this project. Used for relationship mapping and communication tracking.'
              ),
              contractId: createSafeOptionalString(100).describe(
                'Government contract number or identifier. Used for contract tracking and reference verification.'
              ),
              // Alternative field names for compatibility
              name: createSafeOptionalString(200).describe(
                'Alternative field name for project title. Used for backward compatibility with legacy data.'
              ),
              completionYear: z
                .number()
                .min(1990)
                .max(new Date().getFullYear())
                .optional()
                .describe(
                  `Alternative field name for completion year. Used for backward compatibility with legacy data.`
                ),

              // Enhanced fields for better profile enrichment and match scoring
              agency: createSafeOptionalString(200).describe(
                'Government agency served (e.g., Department of Defense, GSA). Used for agency-specific match scoring and expertise demonstration.'
              ),
              naicsCode: z
                .string()
                .regex(/^\d{6}$/, 'NAICS code must be exactly 6 digits')
                .optional()
                .describe(
                'Primary NAICS code for this project. Must be exactly 6 digits. Used for industry classification and capability matching.'
              ),
              pscCode: createSafeOptionalString(20).describe(
                'Product Service Code (PSC) for federal contracting classification. Used for procurement category matching.'
              ),
              contractType: createSafeOptionalString(50).describe(
                'Contract type (e.g., FFP, CPFF, T&M, IDIQ). Used for contract vehicle experience assessment.'
              ),
              setAsideType: createSafeOptionalString(20).describe(
                'Set-aside designation if applicable (e.g., 8(a), SDVOSB, WOSB). Used for small business opportunity matching.'
              ),
              securityClearanceRequired: createSafeOptionalString(50).describe(
                'Security clearance level required for the project. Used for cleared opportunity matching.'
              ),

              // Geographic information
              performanceLocation: z
                .object({
                  city: createSafeOptionalString(100).describe('City where work was performed'),
                  state: createSafeOptionalString(2).describe('State abbreviation where work was performed'),
                  country: createSafeOptionalString(100).describe('Country where work was performed'),
                  zipCode: createSafeOptionalString(10).describe('ZIP code where work was performed'),
                  isRemote: z.boolean().optional().describe('Whether work was performed remotely')
                })
                .optional()
                .describe(
                  'Geographic location where the project work was performed. Used for location-based opportunity matching and travel requirements assessment.'
                ),

              // Contract details
              contractDuration: createSafeOptionalString(50).describe(
                'Contract duration (e.g., 1 year, 2 years, 36 months). Used for timeline experience assessment.'
              ),
              primeContractor: z
                .boolean()
                .optional()
                .describe(
                  'Whether this was a prime contract (true) or subcontract (false). Used for prime/sub experience evaluation.'
                ),
              subcontractorRole: createSafeOptionalString(200).describe(
                'Role if working as subcontractor. Used for subcontracting capability assessment.'
              ),
              teamSize: z
                .number()
                .positive()
                .max(100000)
                .optional()
                .describe(
                  'Size of team working on the project. Used for scale and capacity assessment.'
                ),

              // Performance metrics (removed onTimeDelivery and onBudgetDelivery)
              customerSatisfactionRating: z
                .number()
                .min(1)
                .max(5)
                .optional()
                .describe(
                  'Customer satisfaction rating (1-5 scale) if available. Used for performance quality assessment.'
                ),
              awardFeeEarned: z
                .number()
                .positive()
                .max(999999999)
                .optional()
                .describe(
                  'Award fee earned if applicable (in US dollars). Used for performance incentive track record.'
                ),

              // Key achievements and technologies
              keyAchievements: z
                .array(createSafeString(1, 500))
                .max(10)
                .optional()
                .describe(
                  'List of key achievements or accomplishments. Maximum 10 items, 500 characters each. Used for differentiating capabilities and outcomes.'
                ),
              technologiesUsed: z
                .array(createSafeString(1, 100))
                .max(20)
                .optional()
                .describe(
                  'Technologies, tools, or methodologies used. Maximum 20 items, 100 characters each. Used for technical capability matching.'
                ),
              certificationsMet: z
                .array(createSafeString(1, 100))
                .max(10)
                .optional()
                .describe(
                  'Certifications required or met for this project. Maximum 10 items, 100 characters each. Used for certification-specific opportunity matching.'
                ),
            })
          )
          .max(15)
          .optional()
          .describe(
            "List of key projects demonstrating company's past performance. Maximum 15 projects. Properly typed to match KeyProject interface with compatibility fields. Used for capability assessment and past performance evaluation."
          ),
      })
      .optional()
      .describe(
        "Company's past performance information including general description and key project details. Properly typed to match ProfilePastPerformance interface. Used for qualification assessment and capability demonstration."
      ),

    // Brand Voice & Communication Preferences
    brandVoice: z
      .nativeEnum(BrandVoice)
      .optional()
      .describe(
        'Brand voice preference for company communication style. Used for messaging consistency and client alignment. Options include Professional, Friendly, Technical, Authoritative, Creative, and Collaborative.'
      ),
    brandTone: z
      .nativeEnum(BrandTone)
      .optional()
      .describe(
        'Communication tone preference for business interactions. Used for messaging strategy and proposal writing. Options include Formal, Conversational, Direct, Collaborative, Consultative, and Results-Driven.'
      ),

    // Geographic Preferences
    geographicPreferences: z
      .object({
        preferences: z
          .object({
            country: z.array(
              z.object({
                id: z.string().optional(),
                type: z.enum(['country', 'state', 'county', 'city', 'zip']).or(z.nativeEnum(GeographicPreferenceType)).optional(),
                name: z.string().optional(),
                fullPath: z.string().optional(),
                data: z.any().optional(),
                zipCodes: z.array(z.string()).optional(),
                cities: z.array(z.string()).optional(),
                states: z.array(z.string()).optional(),
                countries: z.array(z.string()).optional(),
                regions: z.array(z.string()).optional(),
                radius: z.number().optional(),
                notes: z.string().optional()
              })
            ).optional().default([]),
            state: z.array(
              z.object({
                id: z.string().optional(),
                type: z.enum(['country', 'state', 'county', 'city', 'zip']).or(z.nativeEnum(GeographicPreferenceType)).optional(),
                name: z.string().optional(),
                fullPath: z.string().optional(),
                data: z.any().optional(),
                zipCodes: z.array(z.string()).optional(),
                cities: z.array(z.string()).optional(),
                states: z.array(z.string()).optional(),
                countries: z.array(z.string()).optional(),
                regions: z.array(z.string()).optional(),
                radius: z.number().optional(),
                notes: z.string().optional()
              })
            ).optional().default([]),
            county: z.array(
              z.object({
                id: z.string().optional(),
                type: z.enum(['country', 'state', 'county', 'city', 'zip']).or(z.nativeEnum(GeographicPreferenceType)).optional(),
                name: z.string().optional(),
                fullPath: z.string().optional(),
                data: z.any().optional(),
                zipCodes: z.array(z.string()).optional(),
                cities: z.array(z.string()).optional(),
                states: z.array(z.string()).optional(),
                countries: z.array(z.string()).optional(),
                regions: z.array(z.string()).optional(),
                radius: z.number().optional(),
                notes: z.string().optional()
              })
            ).optional().default([]),
            city: z.array(
              z.object({
                id: z.string().optional(),
                type: z.enum(['country', 'state', 'county', 'city', 'zip']).or(z.nativeEnum(GeographicPreferenceType)).optional(),
                name: z.string().optional(),
                fullPath: z.string().optional(),
                data: z.any().optional(),
                zipCodes: z.array(z.string()).optional(),
                cities: z.array(z.string()).optional(),
                states: z.array(z.string()).optional(),
                countries: z.array(z.string()).optional(),
                regions: z.array(z.string()).optional(),
                radius: z.number().optional(),
                notes: z.string().optional()
              })
            ).optional().default([]),
            zip: z.array(
              z.object({
                id: z.string().optional(),
                type: z.enum(['country', 'state', 'county', 'city', 'zip']).or(z.nativeEnum(GeographicPreferenceType)).optional(),
                name: z.string().optional(),
                fullPath: z.string().optional(),
                data: z.any().optional(),
                zipCodes: z.array(z.string()).optional(),
                cities: z.array(z.string()).optional(),
                states: z.array(z.string()).optional(),
                countries: z.array(z.string()).optional(),
                regions: z.array(z.string()).optional(),
                radius: z.number().optional(),
                notes: z.string().optional()
              })
            ).optional().default([])
          })
          .optional()
          .default({
            country: [],
            state: [],
            county: [],
            city: [],
            zip: []
          })
          .describe('Geographic preferences organized by location type (country, state, county, city, zip)'),
        workFromHome: z
          .boolean()
          .optional()
          .describe('Ability to work remotely without on-site presence'),
        travelWillingness: z
          .nativeEnum(TravelWillingness)
          .optional()
          .describe('Willingness and capacity for travel (None, Local, Regional, National, International)'),
        maxTravelPercentage: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('Maximum percentage of time willing to travel (0-100%)')
      })
      .optional()
      .describe(
        'Geographic and travel preferences for contract opportunities. Used for location-based opportunity matching and travel requirement assessment.'
      ),

    // Government Level Preferences
    organizationLevels: z
      .array(z.nativeEnum(OrganizationLevel))
      .optional()
      .describe(
        'Target government levels for contract opportunities (Federal, State, Local). Used for filtering and prioritizing relevant opportunities based on government entity type.'
      ),
  })
  .partial()
  .describe(
    'Schema for updating contractor profile information. All fields are optional and validated for security. Used for company qualification, opportunity matching, and capability assessment.'
  )

// Enhanced Organization validation schemas with proper typing
const OrganizationSettingsSchema = z
  .object({
    // AI Features Settings
    aiFeatures: z
      .object({
        preferredProvider: z
          .enum(['openai', 'anthropic', 'google', 'azure'])
          .optional()
          .describe(
            'Preferred AI provider for cost optimization and performance. Used for intelligent model routing and fallback strategies.'
          ),
        fallbackProviders: z
          .array(z.string())
          .optional()
          .describe(
            'Array of fallback AI providers in order of preference. Used when primary provider fails or is unavailable.'
          ),
        monthlyBudget: z
          .number()
          .positive()
          .optional()
          .describe(
            'Monthly AI usage budget in USD. Used for cost control and usage alerts.'
          ),
        costAlerts: z
          .object({
            enabled: z.boolean().describe('Enable cost alert notifications'),
            thresholds: z
              .array(z.number().min(0).max(100))
              .describe('Alert threshold percentages of budget'),
            recipients: z
              .array(z.string().email())
              .describe('Email addresses to receive cost alerts'),
          })
          .optional(),
        preferredModels: z
          .object({
            chat: z
              .string()
              .optional()
              .describe('Preferred model for chat/conversation'),
            analysis: z
              .string()
              .optional()
              .describe('Preferred model for document analysis'),
            embedding: z
              .string()
              .optional()
              .describe('Preferred model for embeddings'),
          })
          .optional(),
        enableSmartRouting: z
          .boolean()
          .optional()
          .describe(
            'Enable intelligent model routing based on cost and performance'
          ),
        enableCaching: z
          .boolean()
          .optional()
          .describe('Enable response caching for improved performance'),
        enableAnalytics: z
          .boolean()
          .optional()
          .describe('Enable AI usage analytics and monitoring'),
        enableA11yFeatures: z
          .boolean()
          .optional()
          .describe('Enable accessibility features for AI interactions'),
      })
      .optional(),

    // Notification Settings
    notifications: z
      .object({
        emailNotifications: z
          .object({
            enabled: z.boolean().describe('Enable email notifications'),
            frequency: z
              .enum(['immediate', 'hourly', 'daily', 'weekly'])
              .describe('Email notification frequency'),
            types: z
              .array(z.string())
              .describe('Types of notifications to send via email'),
          })
          .optional(),
        inAppNotifications: z
          .object({
            enabled: z.boolean().describe('Enable in-app notifications'),
            showToasts: z.boolean().describe('Show toast notifications'),
            playSounds: z.boolean().describe('Play notification sounds'),
          })
          .optional(),
        digestSettings: z
          .object({
            enabled: z.boolean().describe('Enable digest notifications'),
            frequency: z
              .enum(['daily', 'weekly', 'monthly'])
              .describe('Digest frequency'),
            time: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .describe('Time for digest delivery (HH:MM format)'),
            timezone: z.string().describe('Timezone for digest delivery'),
          })
          .optional(),
      })
      .optional(),

    // Security Settings
    security: z
      .object({
        requireMFA: z
          .boolean()
          .optional()
          .describe('Require multi-factor authentication for all users'),
        sessionTimeout: z
          .number()
          .positive()
          .optional()
          .describe('Session timeout in minutes'),
        allowedIPs: z
          .array(z.string())
          .optional()
          .describe('IP whitelist for organization access'),
        encryptSensitiveData: z
          .boolean()
          .optional()
          .describe('Enable encryption for sensitive data at rest'),
        dataRetentionDays: z
          .number()
          .positive()
          .optional()
          .describe('Data retention period in days'),
        autoDeleteInactive: z
          .boolean()
          .optional()
          .describe('Automatically delete inactive user accounts'),
        auditLogging: z
          .object({
            enabled: z.boolean().describe('Enable audit logging'),
            logLevel: z
              .enum(['basic', 'detailed', 'verbose'])
              .describe('Audit log detail level'),
            retentionDays: z
              .number()
              .positive()
              .describe('Audit log retention period in days'),
          })
          .optional(),
      })
      .optional(),

    // Billing Settings
    billing: z
      .object({
        defaultPaymentMethod: z
          .string()
          .optional()
          .describe('Default payment method ID'),
        billingEmail: z
          .string()
          .email()
          .optional()
          .describe('Email address for billing notifications'),
        invoiceDelivery: z
          .enum(['email', 'portal', 'both'])
          .optional()
          .describe('Invoice delivery method'),
        billingCycle: z
          .enum(['monthly', 'yearly'])
          .optional()
          .describe('Billing cycle preference'),
        autoRenew: z
          .boolean()
          .optional()
          .describe('Enable automatic subscription renewal'),
        usageAlerts: z
          .object({
            enabled: z.boolean().describe('Enable usage alert notifications'),
            thresholds: z
              .array(
                z.object({
                  metric: z.string().describe('Usage metric to monitor'),
                  percentage: z
                    .number()
                    .min(0)
                    .max(100)
                    .describe('Alert threshold percentage'),
                  action: z
                    .enum(['notify', 'throttle', 'block'])
                    .describe('Action to take when threshold is reached'),
                })
              )
              .describe('Usage alert configurations'),
          })
          .optional(),
      })
      .optional(),

    // Integration Settings
    integrations: z
      .object({
        samGovSync: z
          .object({
            enabled: z.boolean().describe('Enable SAM.gov synchronization'),
            autoSync: z.boolean().describe('Enable automatic synchronization'),
            syncFrequency: z
              .enum(['daily', 'weekly', 'monthly'])
              .describe('Synchronization frequency'),
            lastSyncAt: z
              .string()
              .optional()
              .describe('Last synchronization timestamp'),
          })
          .optional(),
        crmIntegration: z
          .object({
            provider: z
              .enum(['salesforce', 'hubspot', 'pipedrive', 'custom'])
              .describe('CRM provider'),
            enabled: z.boolean().describe('Enable CRM integration'),
            syncBidirectional: z
              .boolean()
              .describe('Enable bidirectional synchronization'),
            fieldMappings: z
              .record(z.string())
              .describe('Field mapping configuration'),
          })
          .optional(),
        emailIntegration: z
          .object({
            provider: z
              .enum(['gmail', 'outlook', 'custom'])
              .describe('Email provider'),
            enabled: z.boolean().describe('Enable email integration'),
            autoClassify: z
              .boolean()
              .describe('Automatically classify incoming emails'),
          })
          .optional(),
      })
      .optional(),

    // General Settings
    timezone: z.string().optional().describe('Organization timezone'),
    dateFormat: z
      .enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'])
      .optional()
      .describe('Preferred date format'),
    currency: z
      .enum(['USD', 'EUR', 'GBP', 'CAD'])
      .optional()
      .describe('Preferred currency'),
    theme: z
      .enum(['light', 'dark', 'auto'])
      .optional()
      .describe('UI theme preference'),
    sidebarCollapsed: z.boolean().optional().describe('Default sidebar state'),
    defaultDashboard: z
      .string()
      .optional()
      .describe('Default dashboard to show on login'),

    // Advanced Settings
    customFields: z
      .array(
        z.object({
          name: z.string().describe('Custom field name'),
          type: z
            .enum(['text', 'number', 'date', 'boolean', 'select'])
            .describe('Field type'),
          options: z
            .array(z.string())
            .optional()
            .describe('Options for select fields'),
          required: z
            .boolean()
            .optional()
            .describe('Whether field is required'),
        })
      )
      .optional()
      .describe('Custom field definitions'),
  })
  .describe('Comprehensive organization settings schema with proper validation')

const OrganizationFeaturesSchema = z
  .object({
    // Plan Features
    plan: z
      .object({
        maxUsers: z
          .number()
          .positive()
          .describe('Maximum number of users allowed'),
        maxProfiles: z
          .number()
          .positive()
          .describe('Maximum number of profiles allowed'),
        maxOpportunities: z
          .number()
          .positive()
          .describe('Maximum number of opportunities to track'),
        maxDocuments: z
          .number()
          .positive()
          .describe('Maximum number of documents allowed'),
        storageGB: z.number().positive().describe('Storage limit in gigabytes'),
        aiRequests: z.number().positive().describe('Monthly AI request limit'),
        advancedAI: z.boolean().describe('Access to advanced AI features'),
        customModels: z.boolean().describe('Access to custom AI models'),
        opportunityMatching: z
          .boolean()
          .describe('AI-powered opportunity matching'),
        advancedAnalytics: z
          .boolean()
          .describe('Advanced analytics and reporting'),
        customReports: z.boolean().describe('Custom report generation'),
        competitiveAnalysis: z
          .boolean()
          .describe('Competitive analysis features'),
        apiAccess: z.boolean().describe('API access for integrations'),
        webhooks: z
          .boolean()
          .describe('Webhook support for real-time notifications'),
        samGovSync: z.boolean().describe('SAM.gov synchronization feature'),
        crmIntegration: z.boolean().describe('CRM integration capabilities'),
        supportLevel: z
          .enum(['community', 'email', 'priority', 'dedicated'])
          .describe('Support level included'),
        sla: z.string().describe('Service level agreement details'),
      })
      .describe('Plan feature configuration'),

    // Feature Flags
    flags: z
      .object({
        // Beta Features
        betaOpportunityPrediction: z
          .boolean()
          .optional()
          .describe('Enable beta opportunity prediction features'),
        betaAIProposalReview: z
          .boolean()
          .optional()
          .describe('Enable beta AI proposal review features'),
        betaCompetitorAnalysis: z
          .boolean()
          .optional()
          .describe('Enable beta competitor analysis features'),

        // A/B Test Features
        newDashboardDesign: z
          .boolean()
          .optional()
          .describe('Enable new dashboard design'),
        enhancedFiltering: z
          .boolean()
          .optional()
          .describe('Enable enhanced filtering capabilities'),
        improvedMatching: z
          .boolean()
          .optional()
          .describe('Enable improved matching algorithms'),

        // Organization-specific Features
        customBranding: z
          .boolean()
          .optional()
          .describe('Enable custom branding options'),
        whiteLabeling: z
          .boolean()
          .optional()
          .describe('Enable white labeling features'),
        apiRateLimitBypass: z
          .boolean()
          .optional()
          .describe('Bypass standard API rate limits'),

        // Experimental Features
        experimentalAI: z
          .boolean()
          .optional()
          .describe('Enable experimental AI features'),
        experimentalIntegrations: z
          .boolean()
          .optional()
          .describe('Enable experimental integrations'),
        experimentalReporting: z
          .boolean()
          .optional()
          .describe('Enable experimental reporting features'),
      })
      .describe('Feature flags for controlling organization capabilities'),

    // Customizations
    customizations: z
      .object({
        logo: z
          .string()
          .url()
          .optional()
          .describe('Custom organization logo URL'),
        primaryColor: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe('Primary brand color (hex format)'),
        secondaryColor: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe('Secondary brand color (hex format)'),
        customCSS: z
          .string()
          .optional()
          .describe('Custom CSS for organization branding'),
      })
      .optional()
      .describe('Organization branding and customization options'),
  })
  .describe('Organization features and capabilities schema')

// Organization validation schemas
export const OrganizationCreateSchema = z
  .object({
    name: createSafeString(1, 100).describe(
      'Organization name. 1-100 characters, automatically sanitized. Used as the primary identifier for the organization.'
    ),
    slug: z
      .string()
      .min(1, 'Organization slug is required')
      .max(50)
      .regex(
        /^[a-z0-9-]+$/,
        'Slug must contain only lowercase letters, numbers, and hyphens'
      )
      .refine((val) => {
        // Additional slug security checks
        const reservedSlugs = [
          'admin',
          'api',
          'www',
          'mail',
          'ftp',
          'localhost',
          'app',
          'dashboard',
          'settings',
        ]
        return !reservedSlugs.includes(val)
      }, 'This slug is reserved and cannot be used')
      .refine((val) => {
        // No consecutive hyphens
        return !val.includes('--')
      }, 'Slug cannot contain consecutive hyphens')
      .describe(
        'URL-friendly organization identifier. 1-50 characters using lowercase letters, numbers, and hyphens. Cannot use reserved keywords or consecutive hyphens. Used for organization URLs and routing.'
      ),
  })
  .describe(
    'Schema for creating a new organization. Establishes the organization name and unique slug identifier for multi-tenant access control.'
  )

export const OrganizationUpdateSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Organization name is required')
      .max(100)
      .optional()
      .describe(
        'Updated organization name. 1-100 characters. Used to rebrand or correct the organization identifier.'
      ),
    settings: OrganizationSettingsSchema.optional().describe(
      'Organization-specific settings with comprehensive validation. Used for customizing organization behavior, AI preferences, security, billing, and integration configurations.'
    ),
    features: OrganizationFeaturesSchema.optional().describe(
      'Organization feature flags and capabilities with proper validation. Used for controlling access to plan features, beta features, and organization-specific customizations.'
    ),
  })
  .partial()
  .describe(
    'Schema for updating organization information with comprehensive validation. All fields are optional and properly typed for organization management and configuration.'
  )

// Opportunity search validation schemas
export const OpportunitySearchSchema = z
  .object({
    query: createSafeOptionalString(500).describe(
      'Search query text for opportunity matching. Maximum 500 characters, automatically sanitized. Used for keyword-based opportunity discovery.'
    ),
    naicsCodes: z
      .array(z.string().regex(/^\d{6}$/, 'Invalid NAICS code format'))
      .max(20)
      .optional()
      .describe(
        'Array of 6-digit NAICS codes for industry-specific filtering. Maximum 20 codes. Used to find opportunities in specific industries.'
      ),
    agencies: z
      .array(createSafeString(1, 200))
      .max(50)
      .optional()
      .describe(
        'Array of government agency names for filtering. Maximum 50 agencies, 1-200 characters each. Used to find opportunities from specific agencies.'
      ),
    minValue: z
      .number()
      .positive()
      .max(999999999999)
      .optional()
      .describe(
        'Minimum contract value in US dollars. Maximum $9.99 trillion. Used to filter opportunities by contract size.'
      ),
    maxValue: z
      .number()
      .positive()
      .max(999999999999)
      .optional()
      .describe(
        'Maximum contract value in US dollars. Maximum $9.99 trillion. Used to filter opportunities by contract size.'
      ),
    deadline: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Deadline filter in ISO datetime format. Used to find opportunities with specific deadline requirements.'
      ),
    postedFrom: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Start date for posted date range filtering in ISO datetime format. Used to find opportunities posted on or after this date.'
      ),
    postedTo: z
      .string()
      .datetime()
      .optional()
      .describe(
        'End date for posted date range filtering in ISO datetime format. Used to find opportunities posted on or before this date.'
      ),
    states: z
      .array(
        z
          .string()
          .length(2)
          .regex(/^[A-Z]{2}$/, 'Invalid state code')
      )
      .max(51)
      .optional()
      .describe(
        'Array of 2-letter state codes for geographic filtering. Maximum 51 (50 states + DC). Used to find opportunities in specific locations.'
      ),
    performanceStates: z
      .array(
        z
          .string()
          .length(2)
          .regex(/^[A-Z]{2}$/, 'Invalid state code')
      )
      .max(51)
      .optional()
      .describe(
        'Array of 2-letter state codes for work performance location filtering. Maximum 51 (50 states + DC). Used to find opportunities requiring work in specific locations.'
      ),
    setAsideTypes: z
      .array(createSafeString(1, 50))
      .max(20)
      .optional()
      .describe(
        'Array of set-aside types for small business filtering. Maximum 20 types, 1-50 characters each. Used to find opportunities reserved for specific business types.'
      ),
    securityClearances: z
      .array(
        z.enum([
          'None',
          'Public Trust',
          'Secret',
          'Top Secret',
          'TS/SCI',
          'Not Required',
        ])
      )
      .max(5)
      .optional()
      .describe(
        'Array of security clearance levels for filtering. Maximum 5 levels. Used to find opportunities matching available clearance levels.'
      ),
    procurementMethods: z
      .array(createSafeString(1, 100))
      .max(30)
      .optional()
      .describe(
        'Array of procurement methods for filtering. Maximum 30 methods, 1-100 characters each. Used to find opportunities using specific procurement approaches.'
      ),
    competencies: z
      .array(createSafeString(1, 100))
      .max(50)
      .optional()
      .describe(
        'Array of competencies for capability-specific filtering. Maximum 50 competencies, 1-100 characters each. Used to find opportunities matching specific capabilities.'
      ),
    opportunityStatus: z
      .array(
        z.enum([
          'ACTIVE',
          'INACTIVE',
          'CLOSED',
          'CANCELLED',
          'AWARDED',
          'DRAFT',
          'ARCHIVED',
          'DELETED',
          'PENDING',
          'TERMINATED',
          'COMPLETED',
          'SUSPENDED',
        ])
      )
      .max(10)
      .optional()
      .describe(
        'Array of opportunity status values for filtering based on procurement lifecycle. Maximum 10 statuses. Used to find opportunities in specific states (ACTIVE, CLOSED, AWARDED, etc.).'
      ),
    contractDuration: z
      .array(createSafeString(1, 50))
      .max(10)
      .optional()
      .describe(
        'Array of contract duration ranges for filtering. Maximum 10 ranges, 1-50 characters each. Used to find opportunities with specific contract lengths.'
      ),
    sort: z
      .enum(['postedDate', 'deadline', 'contractValue', 'title', 'matchScore'])
      .default('postedDate')
      .describe(
        "Sort field for search results. Default: 'postedDate'. Used to order search results by relevance, date, value, or match score."
      ),
    order: z
      .enum(['asc', 'desc'])
      .default('desc')
      .describe(
        "Sort order for search results. Default: 'desc' (descending). Used to control ascending or descending order of search results."
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe(
        'Maximum number of results to return. Range: 1-50, default: 10. Used for pagination and performance optimization.'
      ),
    offset: z
      .number()
      .min(0)
      .max(10000)
      .default(0)
      .describe(
        'Number of results to skip for pagination. Range: 0-10000, default: 0. Used for pagination through large result sets.'
      ),
  })
  .describe(
    'Schema for searching government contracting opportunities. Supports complex filtering by industry, location, value, agencies, and other criteria.'
  )

// Match score validation schemas
export const MatchScoreCalculateSchema = z
  .object({
    opportunityIds: z
      .array(
        z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid opportunity ID format')
          .describe(
            'Opportunity identifier. 1-100 characters using alphanumeric, hyphens, and underscores. Used to identify specific opportunities for scoring.'
          )
      )
      .min(1)
      .max(50)
      .describe(
        'Array of opportunity IDs to calculate match scores for. Minimum 1, maximum 50 opportunities. Used for bulk match score calculation.'
      ),
    profileId: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid profile ID format')
      .optional()
      .describe(
        "Profile identifier to use for match calculation. Maximum 100 characters using alphanumeric, hyphens, and underscores. Optional - uses current user's profile if not provided."
      ),
    method: z
      .enum(['calculation', 'llm', 'hybrid'])
      .default('calculation')
      .describe(
        'Scoring method to use: calculation (fast), llm (intelligent), or hybrid (balanced). Defaults to calculation.'
      ),
    useAdvancedAnalysis: z
      .boolean()
      .default(false)
      .describe(
        'Enable advanced LLM analysis features including semantic analysis and strategic insights. Only applicable for llm and hybrid methods.'
      ),
    saveToDatabase: z
      .boolean()
      .default(true)
      .describe(
        'Whether to save the calculated match scores to the database for future reference and analytics.'
      ),
    opportunities: z
      .record(z.any())
      .optional()
      .describe(
        'Optional map of opportunity ID to opportunity data for real-time opportunities. Used to provide opportunity details when calculating scores for opportunities not stored in the database.'
      ),
  })
  .describe(
    'Schema for calculating match scores between contractor profiles and opportunities. Used for AI-powered opportunity matching and ranking.'
  )

// Rate limiting schemas
export const RateLimitConfigSchema = z
  .object({
    windowMs: z
      .number()
      .positive()
      .default(15 * 60 * 1000)
      .describe(
        'Rate limiting window in milliseconds. Default: 900000 (15 minutes). Defines the time window for request counting.'
      ),
    maxRequests: z
      .number()
      .positive()
      .default(100)
      .describe(
        'Maximum number of requests allowed within the window. Default: 100. Used to prevent API abuse and ensure fair usage.'
      ),
    message: z
      .string()
      .optional()
      .describe(
        'Custom message to return when rate limit is exceeded. Optional field for providing user-friendly error messages.'
      ),
    standardHeaders: z
      .boolean()
      .default(true)
      .describe(
        'Whether to include standard rate limit headers (X-RateLimit-*). Default: true. Used for client-side rate limit awareness.'
      ),
    legacyHeaders: z
      .boolean()
      .default(false)
      .describe(
        'Whether to include legacy rate limit headers (X-RateLimit-*). Default: false. Used for backwards compatibility with older clients.'
      ),
  })
  .describe(
    'Schema for configuring API rate limiting. Used to prevent abuse and ensure fair API usage across all endpoints.'
  )

// Common validation helpers
export const PaginationSchema = z
  .object({
    page: z
      .number()
      .min(1)
      .default(1)
      .describe(
        'Page number for pagination. Minimum: 1, default: 1. Used to navigate through paginated results.'
      ),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(10)
      .describe(
        'Number of items per page. Range: 1-100, default: 10. Used to control result set size and performance.'
      ),
    offset: z
      .number()
      .min(0)
      .optional()
      .describe(
        'Number of items to skip. Minimum: 0, optional. Automatically calculated from page and limit if not provided.'
      ),
  })
  .transform((data) => ({
    ...data,
    offset: data.offset ?? (data.page - 1) * data.limit,
  }))
  .describe(
    'Schema for pagination parameters. Automatically calculates offset from page and limit. Used for consistent pagination across all endpoints.'
  )

export const IdParamSchema = z
  .object({
    id: z
      .string()
      .min(1, 'ID is required')
      .max(100)
      .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid ID format')
      .describe(
        'Resource identifier. 1-100 characters using alphanumeric, hyphens, and underscores. Used for identifying specific resources in API endpoints.'
      ),
  })
  .describe(
    'Schema for validating resource ID parameters. Used in API endpoints that require resource identification.'
  )

// Error response schema
export const ErrorResponseSchema = z
  .object({
    success: z
      .literal(false)
      .describe(
        'Always false for error responses. Used to indicate request failure in API responses.'
      ),
    error: z
      .string()
      .describe(
        'Error type or code. Used to identify the specific error that occurred for programmatic handling.'
      ),
    message: z
      .string()
      .optional()
      .describe(
        'Human-readable error message. Optional field providing user-friendly error description.'
      ),
    details: z
      .any()
      .optional()
      .describe(
        'Additional error details such as validation errors or stack traces. Optional field for debugging and detailed error information.'
      ),
  })
  .describe(
    'Schema for API error responses. Provides consistent error structure across all endpoints for proper error handling.'
  )

// Success response schema
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z
    .object({
      success: z
        .literal(true)
        .describe(
          'Always true for successful responses. Used to indicate request success in API responses.'
        ),
      data: dataSchema.describe(
        "Response data payload. Contains the actual response data based on the endpoint's data schema."
      ),
    })
    .describe(
      'Schema for API success responses. Provides consistent success structure across all endpoints with typed data payload.'
    )

// Certification form validation schema - Properly typed to match ProfileCertifications interface
export const CertificationFormSchema = z
  .object({
    // Small Business Certifications
    has8a: z
      .boolean()
      .default(false)
      .describe(
        'Indicates if company has 8(a) Business Development certification. Default: false. SBA program for socially and economically disadvantaged small businesses.'
      ),
    eightAExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for 8(a) certification. Required when has8a is true.'
      ),

    hasHubZone: z
      .boolean()
      .default(false)
      .describe(
        'Indicates if company has HUBZone certification. Default: false.'
      ),
    hubZoneExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for HUBZone certification. Required when hasHubZone is true.'
      ),

    hasSdvosb: z
      .boolean()
      .default(false)
      .describe(
        'Indicates if company has SDVOSB certification. Default: false.'
      ),
    sdvosbExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for SDVOSB certification. Required when hasSdvosb is true.'
      ),

    hasWosb: z
      .boolean()
      .default(false)
      .describe('Indicates if company has WOSB certification. Default: false.'),
    wosbExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for WOSB certification. Required when hasWosb is true.'
      ),

    hasEdwosb: z
      .boolean()
      .default(false)
      .describe(
        'Indicates if company has EDWOSB certification. Default: false.'
      ),
    edwosbExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for EDWOSB certification. Required when hasEdwosb is true.'
      ),

    hasVosb: z
      .boolean()
      .default(false)
      .describe('Indicates if company has VOSB certification. Default: false.'),
    vosbExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for VOSB certification. Required when hasVosb is true.'
      ),

    hasSdb: z
      .boolean()
      .default(false)
      .describe('Indicates if company has SDB certification. Default: false.'),
    sdbExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for SDB certification. Required when hasSdb is true.'
      ),

    // Other Certifications
    hasGSASchedule: z
      .boolean()
      .default(false)
      .describe('Indicates if company has GSA Schedule. Default: false.'),
    gsaScheduleNumber: createSafeOptionalString(20)
      .or(z.literal(''))
      .describe(
        'GSA Schedule contract number. Required when hasGSASchedule is true.'
      ),
    gsaScheduleExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for GSA Schedule. Required when hasGSASchedule is true.'
      ),

    hasClearance: z
      .boolean()
      .default(false)
      .describe(
        'Indicates if company has security clearance capability. Default: false.'
      ),
    clearanceLevel: z
      .union([
        z.enum(['Public Trust', 'Secret', 'Top Secret', 'Top Secret/SCI']),
        z.literal(''),
      ])
      .optional()
      .describe(
        'Security clearance level. Required when hasClearance is true.'
      ),

    hasISO9001: z
      .boolean()
      .default(false)
      .describe(
        'Indicates if company has ISO 9001 certification. Default: false.'
      ),
    iso9001ExpirationDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => {
        if (!val || val === '') return true
        const date = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date > today
      }, 'Expiration date must be in the future')
      .describe(
        'Expiration date for ISO 9001 certification. Required when hasISO9001 is true.'
      ),

    hasCMMI: z
      .boolean()
      .default(false)
      .describe('Indicates if company has CMMI certification. Default: false.'),
    cmmiLevel: z
      .union([
        z.enum([
          'CMMI Level 1',
          'CMMI Level 2',
          'CMMI Level 3',
          'CMMI Level 4',
          'CMMI Level 5',
        ]),
        z.literal(''),
      ])
      .optional()
      .describe('CMMI maturity level. Required when hasCMMI is true.'),

    otherCertifications: createSafeOptionalString(1000)
      .or(z.literal(''))
      .describe(
        'Additional certifications not covered above. Free text field.'
      ),

  })
  .refine(
    (data) => {
      // Validate conditional fields - if certification is enabled, related fields should be provided
      const validations = [
        {
          cert: data.has8a,
          dateField: data.eightAExpirationDate,
          name: '8(a) expiration date',
        },
        {
          cert: data.hasHubZone,
          dateField: data.hubZoneExpirationDate,
          name: 'HUBZone expiration date',
        },
        {
          cert: data.hasSdvosb,
          dateField: data.sdvosbExpirationDate,
          name: 'SDVOSB expiration date',
        },
        {
          cert: data.hasWosb,
          dateField: data.wosbExpirationDate,
          name: 'WOSB expiration date',
        },
        {
          cert: data.hasEdwosb,
          dateField: data.edwosbExpirationDate,
          name: 'EDWOSB expiration date',
        },
        {
          cert: data.hasVosb,
          dateField: data.vosbExpirationDate,
          name: 'VOSB expiration date',
        },
        {
          cert: data.hasSdb,
          dateField: data.sdbExpirationDate,
          name: 'SDB expiration date',
        },
        {
          cert: data.hasISO9001,
          dateField: data.iso9001ExpirationDate,
          name: 'ISO 9001 expiration date',
        },
      ]

      for (const validation of validations) {
        if (
          validation.cert &&
          (!validation.dateField || validation.dateField === '')
        ) {
          return false
        }
      }

      // GSA Schedule validation
      if (data.hasGSASchedule) {
        if (!data.gsaScheduleNumber || data.gsaScheduleNumber === '')
          return false
        if (
          !data.gsaScheduleExpirationDate ||
          data.gsaScheduleExpirationDate === ''
        )
          return false
      }

      // Clearance level validation
      if (
        data.hasClearance &&
        (!data.clearanceLevel || data.clearanceLevel === undefined)
      ) {
        return false
      }

      // CMMI level validation
      if (data.hasCMMI && (!data.cmmiLevel || data.cmmiLevel === undefined)) {
        return false
      }

      return true
    },
    {
      message: 'Please provide required information for enabled certifications',
      path: ['certifications'],
    }
  )
  .describe(
    'Schema for certification form validation. Properly typed to match ProfileCertifications interface. Validates all business certifications including expiration dates and required fields. Used for qualification determination and set-aside matching.'
  )

// Validation helper functions
export function validateSearchParams(searchParams: URLSearchParams) {
  // Safely parse array parameters with length limits
  const parseArrayParam = (
    paramValue: string | null,
    maxItems: number = 50
  ) => {
    if (!paramValue) return undefined
    const items = paramValue.split(',').filter(Boolean).slice(0, maxItems) // Limit array size
    return items.length > 0 ? items : undefined
  }

  // Safely parse numeric parameters
  const parseNumericParam = (
    paramValue: string | null,
    max: number = 999999999999
  ) => {
    if (!paramValue) return undefined
    const num = Number(paramValue)
    if (isNaN(num) || num < 0 || num > max) return undefined
    return num
  }

  const params = {
    query: searchParams.get('query')?.substring(0, 500) || undefined, // Limit query length
    naicsCodes: parseArrayParam(searchParams.get('naicsCodes'), 20),
    agencies: parseArrayParam(searchParams.get('agencies'), 50),
    minValue: parseNumericParam(searchParams.get('minValue')),
    maxValue: parseNumericParam(searchParams.get('maxValue')),
    deadline: searchParams.get('deadline') || undefined,
    postedFrom: searchParams.get('postedFrom') || undefined,
    postedTo: searchParams.get('postedTo') || undefined,
    states: parseArrayParam(searchParams.get('states'), 51),
    performanceStates: parseArrayParam(
      searchParams.get('performanceStates'),
      51
    ),
    setAsideTypes: parseArrayParam(searchParams.get('setAsideTypes'), 20),
    securityClearances: parseArrayParam(
      searchParams.get('securityClearances'),
      5
    ),
    procurementMethods: parseArrayParam(
      searchParams.get('procurementMethods'),
      30
    ),
    competencies: parseArrayParam(searchParams.get('competencies'), 50),
    opportunityStatus: parseArrayParam(
      searchParams.get('opportunityStatus'),
      5
    ),
    contractDuration: parseArrayParam(searchParams.get('contractDuration'), 10),
    sort: searchParams.get('sort') || 'postedDate',
    order: (searchParams.get('order') as 'asc' | 'desc') || 'desc',
    limit: Math.min(Math.max(Number(searchParams.get('limit')) || 10, 1), 50),
    offset: Math.min(
      Math.max(Number(searchParams.get('offset')) || 0, 0),
      10000
    ),
  }

  return OpportunitySearchSchema.parse(params)
}

export function createValidationError(error: z.ZodError) {
  return {
    success: false as const,
    error: 'Validation failed',
    details: error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })),
  }
}

/**
 * Utility function to create consistent validation error responses from Zod validation errors.
 * Transforms Zod errors into standardized API error format with field-specific details.
 * Used across all API endpoints for consistent error handling and user feedback.
 */
