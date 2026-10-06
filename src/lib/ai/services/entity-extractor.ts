import { simpleAIClient } from './simple-ai-client'
import { ExtractedEntity, EntityType } from '@/types/documents'

/**
 * Service for extracting entities from document text
 */
export class EntityExtractor {
  constructor() {
    // No initialization needed for simple client
  }

  /**
   * Extract entities from document text using AI
   */
  async extractEntities(
    text: string,
    documentType: string,
    documentName?: string
  ): Promise<{
    success: boolean
    entities?: ExtractedEntity[]
    error?: string
  }> {
    try {
      // Generate dynamic entity types list
      const entityTypesList = (Object.values(EntityType) as string[])
        .map((type) => {
          const description = this.getEntityTypeDescription(type)
          return `- ${type.toLowerCase()}: ${description}`
        })
        .join('\n')

      const entityTypesEnum = (Object.values(EntityType) as string[])
        .map((t) => t.toLowerCase())
        .join(', ')

      const prompt = `Extract UNIQUE and IMPORTANT entities from this document. Focus on government contracting context.

Document Type: ${documentType}${
        documentName
          ? `
Document Name: ${documentName}`
          : ''
      }

Extract these entity types:
${entityTypesList}

IMPORTANT EXTRACTION RULES:
1. Extract only HIGH-VALUE entities that provide meaningful information
2. Avoid duplicates - extract each unique entity only once
3. Focus on entities that are actionable or important for contractors
4. Skip generic terms, common words, and low-value information
5. Prioritize entities with clear government contracting relevance

SPECIAL FOCUS AREAS (full list of Entity types: ${entityTypesEnum}):
  - PERSON - Individual names (John Smith, Jane Doe, contracting officers, project managers, points of contact)
  - ORGANIZATION - Agency names, contractor names, department names, company names, government entities
  - LOCATION - Geographic locations (cities, states, countries, regions, facilities)
  - DATE - All dates including deadlines, response dates, performance periods, award dates, start/end dates
  - MONEY - Contract values, budget amounts, pricing information, fee structures, cost estimates
  - EMAIL - All email addresses (person@company.com, contact@agency.gov, procurement@dept.mil, etc.)
  - PHONE - All phone numbers (123-456-7890, (123) 456-7890, +1-123-456-7890, ext. 1234, etc.)
  - ADDRESS - Physical mailing addresses, facility locations, delivery addresses
  - CONTRACT_NUMBER - Solicitation numbers, contract IDs, reference numbers, RFP numbers, award numbers
  - NAICS_CODE - All 6-digit industry classification codes (541511, 541330, 236220, etc.)
  - CERTIFICATION - Required certifications, security clearances, business classifications (8(a), HUBZone, SDVOSB, etc.)
  - DEADLINE - Submission deadlines, proposal due dates, response timeframes
  - REQUIREMENT - Technical requirements, specifications, deliverables, performance standards, compliance needs
  - MISC - Any other relevant information that doesn't fit the above categories (URLs, document numbers, special instructions, etc.)

For each entity provide:
1. text - The exact text of the entity (be precise, avoid variations)
2. type - One of: ${entityTypesEnum}
3. confidence - YOUR CALCULATED confidence score (0.0-1.0) based on:
   - How clearly identifiable the entity is in the text
   - How well it matches the expected entity type
   - Context clarity and your extraction certainty
   - Overall quality of the match
4. context - Brief surrounding context

QUALITY FILTERS:
- Only extract entities with confidence >= 0.7
- Ensure each text value is unique (no duplicates)
- Focus on entities that would help contractors understand the opportunity
- Skip overly generic or common terms
- Pay special attention to contact information (emails, phones) as these are critical for contractors

Return as JSON array (maximum 50 entities):
[
  {
    "text": "John Smith",
    "type": "person",
    "confidence": 0.95,
    "context": "Contracting Officer Representative"
  }
]

Document Text:
${text}`

      const result = await simpleAIClient.generateCompletion({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert entity extraction system for government contracting documents. Extract all relevant entities with high accuracy. IMPORTANT: Calculate real confidence scores based on your analysis certainty - do not use placeholder values. Consider entity clarity, context, and your extraction confidence when assigning scores.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        maxTokens: 4000,
        temperature: 0.1,
      })

      if (!result.content) {
        throw new Error('No response from AI service')
      }

      const entities = this.parseEntitiesResponse(result.content, text)
      return { success: true, entities }
    } catch (error) {
      console.error('Entity extraction error:', error)

      // Fallback to pattern-based extraction
      const fallbackEntities = this.extractEntitiesWithPatterns(text)
      return { success: true, entities: fallbackEntities }
    }
  }

  private parseEntitiesResponse(
    response: string,
    originalText: string
  ): ExtractedEntity[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('No JSON array found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }

      // Debug: Show first 3 entities from AI
      console.log(
        `🤖 [AI RESPONSE] First 3 entities from AI:`,
        parsed.slice(0, 3)
      )

      const entities = parsed
        .map((entity: any) => {
          // Try to find the entity text in the original document
          const startOffset = originalText.indexOf(entity.text)
          const endOffset =
            startOffset >= 0
              ? startOffset + entity.text.length
              : entity.text.length

          return {
            text: entity.text?.trim(),
            type: this.normalizeEntityType(entity.type),
            confidence: entity.confidence || 0.7,
            startOffset: startOffset >= 0 ? startOffset : 0,
            endOffset: endOffset,
            // Store the AI's original type for proper conversion later
            originalAIType: entity.type?.toLowerCase(),
          }
        })
        .filter(
          (entity) =>
            entity.text && entity.text.length > 0 && entity.confidence >= 0.7
        )

      // Remove duplicates based on text and type
      return this.deduplicateEntities(entities)
    } catch (error) {
      console.error('Failed to parse entities response:', error)
      return this.extractEntitiesWithPatterns(response)
    }
  }

  private normalizeEntityType(type: string): ExtractedEntity['type'] {
    const normalized = type.toLowerCase()

    // Map AI-extracted types to ExtractedEntity types (limited by ExtractedEntity interface)
    // Note: EMAIL, PHONE, NAICS_CODE etc. must be mapped to 'misc' due to ExtractedEntity limitation
    // but we'll handle the proper typing in the document processor when storing to database
    const entityTypeMap: Record<string, ExtractedEntity['type']> = {
      person: EntityType.PERSON,
      organization: EntityType.ORGANIZATION,
      location: EntityType.LOCATION,
      date: EntityType.DATE,
      money: EntityType.MONEY,
      email: EntityType.EMAIL, // Will be properly typed as EMAIL in database
      phone: EntityType.PHONE, // Will be properly typed as PHONE in database
      address: EntityType.ADDRESS,
      contract_number: EntityType.CONTRACT_NUMBER, // Will be properly typed as CONTRACT_NUMBER in database
      naics_code: EntityType.NAICS_CODE, // Will be properly typed as NAICS_CODE in database
      certification: EntityType.CERTIFICATION, // Will be properly typed as CERTIFICATION in database
      deadline: EntityType.DEADLINE, // Will be properly typed as DEADLINE in database
      requirement: EntityType.REQUIREMENT, // Will be properly typed as REQUIREMENT in database
      misc: EntityType.MISC,
    }

    return entityTypeMap[normalized] || EntityType.MISC
  }

  /**
   * Convert ExtractedEntity to proper EntityType based on content analysis
   * This fixes the type mapping issue between extraction and database storage
   */
  determineProperEntityType(entity: ExtractedEntity): EntityType {
    // Debug logging
    console.log(`🔍 [ENTITY TYPE CONVERSION] Converting entity:`, {
      text: entity.text,
      type: entity.type,
      originalAIType: entity.originalAIType,
    })

    // COMPLETE MAPPING FOR ALL 14 EntityType ENUM VALUES
    // FIRST: Trust the AI's original decision if available
    if (entity.originalAIType) {
      const fullAITypeMapping: Record<string, EntityType> = {
        // Core entity types
        person: EntityType.PERSON,
        organization: EntityType.ORGANIZATION,
        location: EntityType.LOCATION,
        date: EntityType.DATE,
        money: EntityType.MONEY,

        // Extended entity types (the ones causing issues)
        email: EntityType.EMAIL,
        phone: EntityType.PHONE,
        address: EntityType.ADDRESS,
        contract_number: EntityType.CONTRACT_NUMBER,
        naics_code: EntityType.NAICS_CODE,
        certification: EntityType.CERTIFICATION,
        deadline: EntityType.DEADLINE,
        requirement: EntityType.REQUIREMENT,
        misc: EntityType.MISC,
      }

      const aiType = fullAITypeMapping[entity.originalAIType.toLowerCase()]
      if (aiType) {
        console.log(
          `✅ [ENTITY TYPE CONVERSION] Mapped ${entity.originalAIType} to ${aiType}`
        )
        return aiType
      }
    }

    // FALLBACK: Pattern-based detection for specific types
    const text = entity.text

    // Email pattern - improved to catch more variations
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(text)) {
      console.log(`📧 [PATTERN MATCH] Detected email: ${text}`)
      return EntityType.EMAIL
    }

    // Phone pattern - improved to catch 10-digit numbers
    const phoneText = text.replace(/[\s\-\.\(\)]/g, '') // Remove all formatting
    if (
      /^(\+?1)?[0-9]{10}$/.test(phoneText) ||
      /^[0-9]{10}$/.test(text) ||
      /^\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(text)
    ) {
      console.log(`📞 [PATTERN MATCH] Detected phone: ${text}`)
      return EntityType.PHONE
    }

    // NAICS code pattern - 5-6 digits
    if (/^\d{5,6}$/.test(text)) {
      const numericValue = parseInt(text)
      // NAICS codes range from 11111 to 999999
      if (numericValue >= 11000 && numericValue <= 999999) {
        console.log(`🏭 [PATTERN MATCH] Detected NAICS code: ${text}`)
        return EntityType.NAICS_CODE
      }
    }

    // Contract number pattern
    if (/^[A-Z0-9]{2,}-\d{2,}-[A-Z]-\d{4,}$/.test(text)) {
      console.log(`📄 [PATTERN MATCH] Detected contract number: ${text}`)
      return EntityType.CONTRACT_NUMBER
    }

    // Address pattern (basic detection)
    if (
      /\d+\s+[A-Za-z\s]+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ct|Court|Ln|Lane|Way|Pl|Place)/i.test(
        text
      )
    ) {
      console.log(`🏠 [PATTERN MATCH] Detected address: ${text}`)
      return EntityType.ADDRESS
    }

    // Money pattern
    if (/^\$/.test(text) || entity.type === EntityType.MONEY) {
      return EntityType.MONEY
    }

    // Date pattern or date type
    if (
      entity.type === EntityType.DATE ||
      /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(text)
    ) {
      return EntityType.DATE
    }

    return Object.values(EntityType).includes(entity.type) ? entity.type : EntityType.MISC;
  }

  private getEntityTypeDescription(entityType: string): string {
    const descriptions: Record<string, string> = {
      PERSON: 'Names of people, contracting officers, project managers',
      ORGANIZATION: 'Company names, government agencies, departments',
      LOCATION: 'Cities, states, addresses, facilities',
      DATE: 'Important dates, deadlines, periods',
      MONEY: 'Contract values, costs, budgets, pricing',
      EMAIL: 'Email addresses of contacts',
      PHONE: 'Phone numbers and contact information',
      ADDRESS: 'Physical addresses and locations',
      CONTRACT_NUMBER: 'Contract numbers and identifiers',
      NAICS_CODE: 'NAICS industry codes',
      CERTIFICATION: 'Certifications and qualifications',
      DEADLINE: 'Deadlines and time constraints',
      REQUIREMENT: 'Requirements and specifications',
      MISC: 'Other important entities',
    }

    return descriptions[entityType] || 'Other important entities'
  }

  private extractEntitiesWithPatterns(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = []

    // Date patterns
    const datePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
    ]

    for (const pattern of datePatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: EntityType.DATE,
          confidence: 0.85, // High confidence for regex-matched dates
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        })
      }
    }

    // Money patterns
    const moneyPatterns = [
      /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|M|B|K))?/gi,
      /USD\s*[\d,]+(?:\.\d{2})?/gi,
    ]

    for (const pattern of moneyPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: EntityType.MONEY,
          confidence: 0.9, // Very high confidence for $ patterns
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        })
      }
    }

    // Contract numbers
    const contractPattern = /\b[A-Z0-9]{2,}-\d{2,}-[A-Z]-\d{4,}\b/g
    let match
    while ((match = contractPattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: EntityType.CONTRACT_NUMBER,
        confidence: 0.8, // Good confidence for contract number patterns
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      })
    }

    // NAICS codes - Enhanced extraction with better patterns
    const naicsPattern = /\b\d{6}\b/g
    while ((match = naicsPattern.exec(text)) !== null) {
      // Check if it's likely a NAICS code based on expanded context
      const context = text.substring(
        Math.max(0, match.index - 40),
        Math.min(text.length, match.index + match[0].length + 40)
      )
      const lowerContext = context.toLowerCase()

      // Enhanced NAICS detection patterns
      const isNAICS =
        lowerContext.includes('naics') ||
        lowerContext.includes('industry code') ||
        lowerContext.includes('classification code') ||
        lowerContext.includes('business code') ||
        lowerContext.includes('primary code') ||
        lowerContext.includes('secondary code') ||
        lowerContext.includes('sic code') ||
        lowerContext.includes('sector code') ||
        // Check for NAICS code patterns near numbers
        /naics.*code.*\d{6}|\d{6}.*naics.*code|code.*\d{6}.*naics/i.test(
          context
        ) ||
        // Check for common NAICS contexts in government documents
        /primary.*\d{6}|secondary.*\d{6}|industry.*\d{6}|classification.*\d{6}/i.test(
          context
        ) ||
        // Check for table/form contexts where NAICS codes commonly appear
        /code.*\d{6}|\d{6}.*description/i.test(context)

      if (isNAICS) {
        entities.push({
          text: match[0],
          type: EntityType.NAICS_CODE, // ExtractedEntity type system limitation
          confidence: 0.85, // Higher confidence for NAICS with expanded context
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        })
      }
    }

    // Government agencies (common patterns)
    const agencyPatterns = [
      /\b(?:Department of|DoD|DOD|USAF|USN|USA|USMC|NASA|EPA|FDA|CDC|NIH|NSF|NOAA|DOE|DHS|DOJ|DOT|HHS|VA)\b/g,
      /\b(?:Air Force|Navy|Army|Marine Corps|Space Force|Coast Guard)\b/gi,
    ]

    for (const pattern of agencyPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: EntityType.ORGANIZATION,
          confidence: 0.85, // High confidence for known agency patterns
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        })
      }
    }

    // Email addresses - Enhanced extraction
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    while ((match = emailPattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: EntityType.EMAIL, // ExtractedEntity limitation - will show as misc but can be identified by text pattern
        confidence: 0.95, // Very high confidence for email patterns
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      })
    }

    // Phone numbers - Enhanced extraction with multiple patterns
    const phonePatterns = [
      // US phone patterns
      /\b\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g, // (123) 456-7890, 123-456-7890, 123.456.7890
      /\b([0-9]{3})[-.]([0-9]{3})[-.]([0-9]{4})\b/g, // 123-456-7890, 123.456.7890
      /\b\+?1?[-. ]?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g, // +1 (123) 456-7890
      /\b([0-9]{10})\b/g, // 1234567890 (10 consecutive digits)
    ]

    for (const pattern of phonePatterns) {
      pattern.lastIndex = 0 // Reset regex state
      while ((match = pattern.exec(text)) !== null) {
        const phoneNumber = match[0]
        // Validate it looks like a phone number (not just any 10 digits)
        if (
          /^[\+]?[1]?[\s\-\.]?[\(]?[0-9]{3}[\)]?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}$/.test(
            phoneNumber.replace(/\s+/g, '')
          ) ||
          /^[0-9]{10}$/.test(phoneNumber)
        ) {
          entities.push({
            text: phoneNumber,
            type: EntityType.PHONE, // ExtractedEntity limitation
            confidence: 0.9, // High confidence for phone patterns
            startOffset: match.index,
            endOffset: match.index + match[0].length,
          })
        }
      }
    }

    return entities
  }

  /**
   * Remove duplicate entities based on text similarity and type
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const uniqueEntities: ExtractedEntity[] = []
    const seen = new Set<string>()

    for (const entity of entities) {
      // Create a normalized key for deduplication
      const normalizedText = entity.text.toLowerCase().trim()
      const key = `${normalizedText}:${entity.type}`

      // Skip if we've seen this exact entity
      if (seen.has(key)) {
        continue
      }

      // Check for similar entities (fuzzy matching)
      const isDuplicate = uniqueEntities.some((existing) => {
        if (existing.type !== entity.type) return false

        const existingText = existing.text.toLowerCase().trim()

        // Exact match
        if (existingText === normalizedText) return true

        // Check if one contains the other (for variations like "John Smith" vs "Smith, John")
        if (
          existingText.includes(normalizedText) ||
          normalizedText.includes(existingText)
        ) {
          // Keep the longer, more complete version
          if (entity.text.length > existing.text.length) {
            // Replace the existing with the better version
            const index = uniqueEntities.indexOf(existing)
            uniqueEntities[index] = entity
          }
          return true
        }

        // For names and organizations, check for similarity
        if (
          entity.type === EntityType.PERSON ||
          entity.type === EntityType.ORGANIZATION
        ) {
          const similarity = this.calculateSimilarity(
            existingText,
            normalizedText
          )
          return similarity > 0.8 // 80% similarity threshold
        }

        return false
      })

      if (!isDuplicate) {
        uniqueEntities.push(entity)
        seen.add(key)
      }
    }

    // Sort by confidence (highest first) and limit to reasonable number
    return uniqueEntities
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 100) // Limit to top 100 entities
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const distance = this.levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }
}

export const entityExtractor = new EntityExtractor()
