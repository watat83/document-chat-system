import { BaseAnalyzer } from './base-analyzer'
import { DocumentType, SecurityClassification } from '@/types/documents'
import { ResponseValidators } from '../utils/response-validators'

interface DocumentMetadataAnalysis {
  documentType: DocumentType
  securityClassification: SecurityClassification
  setAsideType?: string
  naicsCodes: string[]
  tags: string[]
  description: string
  summary: string
  keywords: string[]
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical'
  complexityScore: number
  estimatedValue?: string
  deadline?: string
}

/**
 * Service for analyzing document metadata and classification
 */
export class DocumentMetadataAnalyzer extends BaseAnalyzer {
  constructor() {
    super()
  }

  protected getAnalyzerName(): string {
    return 'METADATA ANALYZER'
  }

  /**
   * Analyze document and extract metadata
   */
  async analyzeMetadata(
    extractedText: string,
    documentName: string,
    organizationId: string
  ): Promise<{
    success: boolean
    metadata?: DocumentMetadataAnalysis
    error?: string
  }> {
    console.log(`🔍 [METADATA ANALYZER] Starting analysis for: ${documentName}`);
    console.log(`🔍 [METADATA ANALYZER] Text length: ${extractedText.length} characters`);

    try {
      const prompt = `Analyze this business document and extract key metadata with high precision.

Document Name: ${documentName}

Analyze and provide:
1. documentType - One of: PROPOSAL, CONTRACT, CERTIFICATION, COMPLIANCE, TEMPLATE, SOLICITATION, AMENDMENT, CAPABILITY_STATEMENT, PAST_PERFORMANCE, OTHER
2. securityClassification - One of: PUBLIC, INTERNAL, CONFIDENTIAL, SECRET
3. setAsideType - If applicable: Small Business, Minority-Owned, Women-Owned, Veteran-Owned, or other priority category, or null
4. naicsCodes - Array of ALL 6-digit NAICS codes found (look for patterns like "NAICS: 541511", "Primary NAICS Code: 541330", "Industry Classification: 334516", or any 6-digit numbers in industry/classification context)
5. estimatedValue - Extract contract value, budget, ceiling amount, or estimated dollar amount (e.g., "$2.5M", "$150,000 over 3 years", "Not to exceed $500K")
6. deadline - Extract key deadlines, submission dates, proposal due dates, or important dates (e.g., "July 31, 2025", "30 days from publication", "Due by 2:00 PM EST on Dec 15, 2025")
7. tags - **REQUIRED** Array of SPECIFIC, RELEVANT tags for business document categorization (5-8 tags that would help users find and organize this document)
8. description - Brief, informative description (1-2 sentences)
9. summary - Executive summary (3-5 sentences)
10. keywords - RELEVANT keywords that describe the actual content, services, technologies, or business opportunities mentioned in this document (10-15 keywords)
11. urgencyLevel - Based on deadlines/content: low, medium, high, critical
12. complexityScore - Document complexity (1-10, where 10 is most complex)

IMPORTANT EXTRACTION GUIDELINES:

ESTIMATED VALUE:
- Look for dollar amounts: "$2.5M", "$150,000", "not to exceed $500K", "ceiling of $1.2 million"
- Look for budget references: "total contract value", "maximum amount", "estimated cost", "funding available"
- Include time periods if mentioned: "over 3 years", "annually", "per year"
- If no specific amount found, look for value ranges or approximations

DEADLINE:
- Look for proposal due dates, submission deadlines, response dates
- Extract format like: "July 31, 2025", "30 days from publication", "by 2:00 PM EST"
- Look for phrases: "due by", "submit by", "deadline", "closing date", "proposal due"
- Include time zones and specific times when available

NAICS CODES:
- Look for 6-digit numbers in context of "NAICS", "industry code", "classification", "primary code", "secondary code"
- Extract ALL NAICS codes mentioned, including primary and secondary codes
- Look in tables, forms, and structured data sections

TAGS: **CRITICAL - ALWAYS PROVIDE TAGS ARRAY**
- **MUST ALWAYS INCLUDE** 5-8 relevant tags in the JSON response
- Focus on ACTIONABLE tags that help categorize the document type, industry, or business context
- Examples: "IT Services", "Cybersecurity", "Cloud Computing", "Professional Services", "R&D", "Consulting", "Healthcare", "Finance", "Small Business", "Enterprise", "SaaS", "Subscription"
- Avoid generic tags like "business" or "document"
- Use 3-15 character tags that are searchable and meaningful
- **NEVER return empty tags array** - always provide at least 3-5 relevant tags

KEYWORDS:
- Extract keywords that describe the ACTUAL CONTENT of the document
- Focus on technologies, services, methodologies, systems, or specific requirements mentioned
- Include technical terms, software names, methodologies, compliance standards
- Examples: "AWS", "Microsoft Azure", "Agile", "DevOps", "ISO 27001", "GDPR", "SOC 2", "AI/ML", "Data Analytics"
- Avoid filler words and focus on terms that would help someone understand what this document/opportunity is about

Return as JSON:
{
  "documentType": "PROPOSAL",
  "securityClassification": "INTERNAL",
  "setAsideType": "Small Business",
  "naicsCodes": ["541511", "541330", "334516"],
  "estimatedValue": "$2.5M over 3 years",
  "deadline": "July 31, 2025 by 2:00 PM EST",
  "tags": ["IT Services", "Cybersecurity", "Cloud Computing", "AWS", "Enterprise", "Compliance", "DevSecOps"],
  "description": "Business proposal for cloud infrastructure services with cybersecurity compliance requirements.",
  "summary": "This document outlines a comprehensive proposal for enterprise cloud infrastructure services including AWS implementation, cybersecurity frameworks, and compliance measures for a major client engagement.",
  "keywords": ["AWS", "Microsoft Azure", "cybersecurity", "ISO 27001", "cloud migration", "DevSecOps", "infrastructure", "compliance", "security frameworks", "enterprise cloud", "SOC 2", "continuous monitoring", "risk assessment"],
  "urgencyLevel": "high",
  "complexityScore": 7
}

Document Text:
${extractedText}`

      console.log(`🔍 [METADATA ANALYZER] About to call AI service with model: gpt-4o`);
      console.log(`🔍 [METADATA ANALYZER] Prompt length: ${prompt.length} characters`);
      console.log(`🔍 [METADATA ANALYZER] CHECKPOINT 1: Starting executeAICompletion call...`);

      const response = await this.executeAICompletion(
        prompt,
        'You are an expert government contracting document analyzer. Extract accurate metadata for document classification and organization. CRITICAL: Always provide 5-8 relevant tags in the tags array - never return empty tags.',
        {
          model: 'gpt-4o',
          maxTokens: 4000,
          temperature: 0.2,
          timeoutMs: 25000 // Reduced to 25 seconds to be less than document processor timeout
        }
      )

      console.log(`🔍 [METADATA ANALYZER] CHECKPOINT 2: executeAICompletion completed successfully`);
      console.log(`🔍 [METADATA ANALYZER] Response length: ${response?.length || 0} characters`);
      console.log(`🔍 [METADATA ANALYZER] About to parse AI response`);
      const metadata = this.parseMetadataResponse(response, extractedText)
      console.log(`✅ [METADATA ANALYZER] Successfully parsed metadata:`, JSON.stringify(metadata, null, 2));

      // CRITICAL DEBUG: Verify tags are present
      console.log(`🏷️ [TAGS DEBUG] Parsed metadata tags:`, {
        hasTags: !!metadata.tags,
        tagsArray: metadata.tags,
        tagsCount: metadata.tags?.length || 0,
        tagsFirstFew: metadata.tags?.slice(0, 3)
      });

      return { success: true, metadata }

    } catch (error) {
      console.error('❌ [METADATA ANALYZER] Error during analysis:', error)
      console.error('❌ [METADATA ANALYZER] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      // Check if it's a timeout error
      if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('AbortError'))) {
        console.error('⏰ [METADATA ANALYZER] AI request timed out - this is likely the cause of step 1 hanging');
      }

      // Fallback analysis
      console.log(`🔄 [METADATA ANALYZER] Using fallback metadata generation`);
      const fallbackMetadata = this.generateFallbackMetadata(extractedText, documentName)
      console.log(`✅ [METADATA ANALYZER] Fallback metadata generated:`, JSON.stringify(fallbackMetadata, null, 2));

      // CRITICAL DEBUG: Verify fallback tags
      console.log(`🏷️ [FALLBACK TAGS DEBUG] Generated fallback tags:`, {
        hasTags: !!fallbackMetadata.tags,
        tagsArray: fallbackMetadata.tags,
        tagsCount: fallbackMetadata.tags?.length || 0,
        tagsFirstFew: fallbackMetadata.tags?.slice(0, 3)
      });

      return { success: true, metadata: fallbackMetadata }
    }
  }

  private parseMetadataResponse(response: string, originalText: string): DocumentMetadataAnalysis {
    try {
      const parsed = this.parseJsonResponse(response)

      return {
        documentType: ResponseValidators.validateDocumentType(parsed.documentType),
        securityClassification: ResponseValidators.validateSecurityClassification(parsed.securityClassification),
        setAsideType: parsed.setAsideType || undefined,
        naicsCodes: ResponseValidators.validateNaicsCodes(parsed.naicsCodes || []),
        estimatedValue: parsed.estimatedValue || undefined,
        deadline: parsed.deadline || undefined,
        tags: ResponseValidators.validateTags(parsed.tags, originalText, parsed.documentType),
        description: parsed.description || ResponseValidators.generateDescription(originalText),
        summary: parsed.summary || ResponseValidators.generateSummary(originalText),
        keywords: parsed.keywords || ResponseValidators.extractKeywords(originalText),
        urgencyLevel: ResponseValidators.validateUrgencyLevel(parsed.urgencyLevel),
        complexityScore: ResponseValidators.validateScore(parsed.complexityScore, 5, 1, 10)
      }

    } catch (error) {
      console.error('Failed to parse metadata response:', error)
      return this.generateFallbackMetadata(response, '')
    }
  }


  private generateFallbackMetadata(text: string, documentName: string): DocumentMetadataAnalysis {
    const lowerText = text.toLowerCase()
    const lowerName = documentName.toLowerCase()

    // Determine document type from content/name
    let documentType: DocumentType = DocumentType.OTHER
    if (lowerName.includes('proposal') || lowerText.includes('proposal')) {
      documentType = DocumentType.PROPOSAL
    } else if (lowerName.includes('contract') || lowerText.includes('contract')) {
      documentType = DocumentType.CONTRACT
    } else if (lowerName.includes('solicitation') || lowerText.includes('rfp') || lowerText.includes('rfq')) {
      documentType = DocumentType.SOLICITATION
    }

    // Check for business priority categories
    let setAsideType: string | undefined
    if (lowerText.includes('small business') || lowerText.includes('sme')) {
      setAsideType = 'Small Business'
    } else if (lowerText.includes('minority') || lowerText.includes('mbe')) {
      setAsideType = 'Minority-Owned'
    } else if (lowerText.includes('women') || lowerText.includes('wbe') || lowerText.includes('woman-owned')) {
      setAsideType = 'Women-Owned'
    } else if (lowerText.includes('veteran') || lowerText.includes('vbe')) {
      setAsideType = 'Veteran-Owned'
    }

    // Extract NAICS codes
    const naicsCodes: string[] = []
    const naicsPattern = /\b\d{6}\b/g
    let match
    while ((match = naicsPattern.exec(text)) !== null) {
      const context = text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20))
      if (context.toLowerCase().includes('naics')) {
        naicsCodes.push(match[0])
      }
    }

    // Extract estimated value patterns
    let estimatedValue: string | undefined
    const valuePatterns = [
      /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|M|B|K))?/gi,
      /\b\d+\s*(?:million|billion|thousand)\s*dollars?\b/gi,
      /not\s+to\s+exceed\s+\$[\d,]+/gi,
      /ceiling\s+(?:of\s+)?\$[\d,]+/gi
    ]

    for (const pattern of valuePatterns) {
      const match = text.match(pattern)
      if (match) {
        estimatedValue = match[0]
        break
      }
    }

    // Extract deadline patterns
    let deadline: string | undefined
    const deadlinePatterns = [
      /due\s+(?:by\s+|date\s*:?\s*)?[\w\s,]+\d{4}/gi,
      /deadline\s*:?\s*[\w\s,]+\d{4}/gi,
      /submit\s+by\s+[\w\s,]+\d{4}/gi,
      /closing\s+date\s*:?\s*[\w\s,]+\d{4}/gi,
      /proposal\s+due\s+[\w\s,]+\d{4}/gi
    ]

    for (const pattern of deadlinePatterns) {
      const match = text.match(pattern)
      if (match) {
        deadline = match[0]
        break
      }
    }

    return {
      documentType,
      securityClassification: SecurityClassification.INTERNAL,
      setAsideType,
      naicsCodes,
      estimatedValue,
      deadline,
      tags: this.generateFallbackTags(text, documentType),
      description: ResponseValidators.generateDescription(text),
      summary: ResponseValidators.generateSummary(text),
      keywords: ResponseValidators.extractKeywords(text),
      urgencyLevel: 'medium',
      complexityScore: 5
    }
  }

  private generateFallbackTags(text: string, documentType: DocumentType): string[] {
    const lowerText = text.toLowerCase()
    const tags: string[] = []

    // Add document type-based tag
    switch (documentType) {
      case DocumentType.PROPOSAL:
        tags.push('Proposal')
        break
      case DocumentType.CONTRACT:
        tags.push('Contract')
        break
      case DocumentType.SOLICITATION:
        tags.push('Solicitation')
        break
      case DocumentType.CERTIFICATION:
        tags.push('Certification')
        break
      default:
        tags.push('Document')
    }

    // Industry/service tags based on content
    if (lowerText.includes('it ') || lowerText.includes('software') || lowerText.includes('technology')) {
      tags.push('IT Services')
    }
    if (lowerText.includes('cyber') || lowerText.includes('security')) {
      tags.push('Cybersecurity')
    }
    if (lowerText.includes('cloud') || lowerText.includes('aws') || lowerText.includes('azure')) {
      tags.push('Cloud Computing')
    }
    if (lowerText.includes('professional services') || lowerText.includes('consulting')) {
      tags.push('Professional Services')
    }
    if (lowerText.includes('defense') || lowerText.includes('dod') || lowerText.includes('military')) {
      tags.push('Defense')
    }
    if (lowerText.includes('healthcare') || lowerText.includes('medical')) {
      tags.push('Healthcare')
    }
    if (lowerText.includes('8(a)') || lowerText.includes('small business') || lowerText.includes('hubzone')) {
      tags.push('Small Business')
    }
    if (lowerText.includes('rfp') || lowerText.includes('request for proposal')) {
      tags.push('RFP')
    }
    if (lowerText.includes('rfq') || lowerText.includes('request for quote')) {
      tags.push('RFQ')
    }
    if (lowerText.includes('compliance') || lowerText.includes('fisma') || lowerText.includes('nist')) {
      tags.push('Compliance')
    }

    // Ensure we have at least 3 tags
    if (tags.length < 3) {
      const keywords = ResponseValidators.extractKeywords(text).slice(0, 5)
      tags.push(...keywords.filter(k => !tags.includes(k)))
    }

    // Limit to 8 tags and ensure uniqueness
    return Array.from(new Set(tags)).slice(0, 8)
  }
}

export const documentMetadataAnalyzer = new DocumentMetadataAnalyzer()
