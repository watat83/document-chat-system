import { BaseAnalyzer } from './base-analyzer'
import { SecurityClassification } from '@/types/documents'
import { ResponseValidators } from '../utils/response-validators'

interface SecurityAnalysis {
  classification: SecurityClassification
  sensitiveDataDetected: boolean
  sensitiveDataTypes: string[]
  securityRisks: string[]
  complianceIssues: string[]
  recommendations: string[]
  confidenceScore: number
  redactedContent?: string
}

/**
 * Service for analyzing document security and detecting sensitive information
 */
export class DocumentSecurityAnalyzer extends BaseAnalyzer {
  constructor() {
    super()
  }

  protected getAnalyzerName(): string {
    return 'SECURITY ANALYZER'
  }

  /**
   * Analyze document for security classification and sensitive content
   */
  async analyzeSecurity(
    extractedText: string,
    documentName: string
  ): Promise<{
    success: boolean
    analysis?: SecurityAnalysis
    error?: string
  }> {
    try {
      const prompt = `Analyze this government contracting document for security classification and sensitive information.

Document Name: ${documentName}

CRITICAL: You MUST return a valid JSON object with all required fields. No additional text or explanations.

Required JSON structure (MUST include ALL fields):
{
  "classification": "PUBLIC",
  "sensitiveDataDetected": false,
  "sensitiveDataTypes": [],
  "securityRisks": [],
  "complianceIssues": [],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "confidenceScore": 85
}

IMPORTANT FIELD REQUIREMENTS:
- classification: MUST be exactly one of: "PUBLIC", "INTERNAL", "CONFIDENTIAL", "SECRET"
- sensitiveDataDetected: MUST be exactly true or false (boolean)
- sensitiveDataTypes: MUST be an array of strings (can be empty [])
- securityRisks: MUST be an array of strings (can be empty [])
- complianceIssues: MUST be an array of strings (can be empty [])
- recommendations: MUST be an array with 2-4 string recommendations
- confidenceScore: MUST be a number between 1-100 (integer, no decimals)

Analysis Guidelines:
- classification: Determine security level based on content sensitivity
  - PUBLIC: General information, public announcements, marketing materials
  - INTERNAL: Internal business use, non-sensitive operational data
  - CONFIDENTIAL: Sensitive business information, limited access required
  - SECRET: Highly sensitive, restricted access required
- sensitiveDataDetected: true if ANY sensitive data found (SSN, credit cards, PII, etc.)
- sensitiveDataTypes: List specific types found: ["SSN", "Credit Cards", "Email Addresses", "Phone Numbers", "Financial Data", "Classification Markers", "ITAR/EAR", "Proprietary Information"]
- securityRisks: List potential security risks identified
- complianceIssues: List compliance violations or concerns found
- recommendations: Always provide 2-4 actionable security recommendations
- confidenceScore: Your confidence in the analysis (1-100, where 100 = very confident, 1 = very uncertain)

CONFIDENCE SCORE GUIDELINES:
- 90-100: Very confident, clear classification with obvious indicators
- 80-89: Confident, classification supported by multiple indicators
- 70-79: Moderately confident, some indicators present
- 60-69: Less confident, limited indicators or mixed signals
- 50-59: Low confidence, unclear or contradictory indicators
- 1-49: Very low confidence, insufficient information

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT OR EXPLANATIONS.

Document Text:
${extractedText}`

      console.log(`🔍 [SECURITY ANALYZER] Starting analysis for document: ${documentName}`);
      console.log(`🔍 [SECURITY ANALYZER] Text length: ${extractedText.length} characters`);

      const response = await this.executeAICompletion(
        prompt,
        'You are an expert security analyst specializing in government contracting documents. Identify sensitive information and security risks with high accuracy.',
        {
          model: 'gpt-4o',
          maxTokens: 4000, // 4k tokens max for GPT-4o output
          temperature: 0.1 // Low temperature for consistent security analysis
        }
      )

      console.log(`🔍 [SECURITY ANALYZER] Raw AI response (first 800 chars):`, response.substring(0, 800));

      const analysis = this.parseSecurityAnalysis(response, extractedText)
      console.log(`✅ [SECURITY ANALYZER] Final parsed analysis:`, {
        classification: analysis.classification,
        confidenceScore: analysis.confidenceScore,
        sensitiveDataDetected: analysis.sensitiveDataDetected,
        securityRisksCount: analysis.securityRisks.length,
        recommendationsCount: analysis.recommendations.length
      });

      // Validation check: Ensure confidence score is always a valid number
      if (typeof analysis.confidenceScore !== 'number' || isNaN(analysis.confidenceScore) || analysis.confidenceScore < 0 || analysis.confidenceScore > 100) {
        console.error(`❌ [SECURITY ANALYZER] CRITICAL: Invalid confidence score detected!`, {
          confidenceScore: analysis.confidenceScore,
          type: typeof analysis.confidenceScore,
          isNaN: isNaN(analysis.confidenceScore)
        });
        // Force a reasonable default confidence score
        analysis.confidenceScore = analysis.classification === 'PUBLIC' ? 85 : 75;
        console.log(`🔧 [SECURITY ANALYZER] Forced confidence score to:`, analysis.confidenceScore);
      }

      return { success: true, analysis: analysis }

    } catch (error) {
      console.error('Security analysis error:', error)

      // Fallback analysis with conservative security approach
      const fallbackAnalysis = this.generateFallbackSecurityAnalysis(extractedText)
      return { success: true, analysis: fallbackAnalysis }
    }
  }

  private parseSecurityAnalysis(response: string, originalText: string): SecurityAnalysis {
    try {
      console.log(`🔍 [SECURITY ANALYZER] Parsing AI response (${response.length} chars):`, response.substring(0, 500) + '...');

      const parsed = this.parseJsonResponse(response)
      console.log(`🔍 [SECURITY ANALYZER] Parsed JSON object:`, {
        classification: parsed.classification,
        confidenceScore: parsed.confidenceScore,
        confidenceScoreType: typeof parsed.confidenceScore,
        sensitiveDataDetected: parsed.sensitiveDataDetected,
        allKeys: Object.keys(parsed)
      });

      // Enhanced confidence score validation with detailed logging
      let confidenceScore;
      if (parsed.confidenceScore !== undefined && parsed.confidenceScore !== null) {
        console.log(`🔍 [SECURITY ANALYZER] Raw confidence score from AI:`, parsed.confidenceScore, typeof parsed.confidenceScore);
        confidenceScore = ResponseValidators.validateScore(parsed.confidenceScore, 80); // Higher default for security analysis
      } else {
        console.warn(`⚠️ [SECURITY ANALYZER] AI did not provide confidenceScore, using fallback analysis confidence`);
        // Generate confidence based on classification and sensitive data detection
        const baseConfidence = parsed.classification === 'PUBLIC' ? 85 :
                              parsed.classification === 'INTERNAL' ? 75 :
                              parsed.classification === 'CONFIDENTIAL' ? 70 : 65;
        const adjustedConfidence = parsed.sensitiveDataDetected ? Math.max(60, baseConfidence - 10) : baseConfidence;
        confidenceScore = adjustedConfidence;
      }

      console.log(`✅ [SECURITY ANALYZER] Final confidence score:`, confidenceScore);

      return {
        classification: ResponseValidators.validateSecurityClassification(parsed.classification),
        sensitiveDataDetected: Boolean(parsed.sensitiveDataDetected),
        sensitiveDataTypes: ResponseValidators.validateStringArray(parsed.sensitiveDataTypes || []),
        securityRisks: ResponseValidators.validateStringArray(parsed.securityRisks || []),
        complianceIssues: ResponseValidators.validateStringArray(parsed.complianceIssues || []),
        recommendations: ResponseValidators.validateStringArray(parsed.recommendations || []),
        confidenceScore
      }

    } catch (error) {
      console.error('❌ [SECURITY ANALYZER] Failed to parse security analysis, using fallback:', error)
      return this.generateFallbackSecurityAnalysis(originalText)
    }
  }


  private generateFallbackSecurityAnalysis(text: string): SecurityAnalysis {
    console.log(`🔄 [SECURITY ANALYZER] Generating fallback security analysis for ${text.length} character text`);

    const lowerText = text.toLowerCase()
    const sensitiveDataTypes: string[] = []
    const securityRisks: string[] = []
    const complianceIssues: string[] = []
    const recommendations: string[] = []

    // Pattern-based sensitive data detection
    const patterns = {
      ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      phone: /\b\d{3}-?\d{3}-?\d{4}\b/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      bankAccount: /\b\d{9,18}\b/g
    }

    // Check for sensitive patterns
    if (patterns.ssn.test(text)) {
      sensitiveDataTypes.push('Social Security Numbers')
      securityRisks.push('SSN exposure risk')
    }

    if (patterns.creditCard.test(text)) {
      sensitiveDataTypes.push('Credit card numbers')
      securityRisks.push('Financial data exposure')
    }

    if (patterns.phone.test(text)) {
      sensitiveDataTypes.push('Phone numbers')
    }

    if (patterns.email.test(text)) {
      sensitiveDataTypes.push('Email addresses')
    }

    // Check for government/military classifications
    const classificationKeywords = [
      'classified', 'secret', 'confidential', 'restricted',
      'fouo', 'cui', 'itar', 'ear', 'proprietary'
    ]

    let detectedClassificationLevel: SecurityClassification = SecurityClassification.PUBLIC // Default to PUBLIC for most documents
    let classificationConfidence = 75; // Base confidence for PUBLIC classification

    for (const keyword of classificationKeywords) {
      if (lowerText.includes(keyword)) {
        sensitiveDataTypes.push('Classification markers')
        if (keyword === 'secret') {
          detectedClassificationLevel = SecurityClassification.SECRET
          classificationConfidence = 65; // Lower confidence for auto-detected SECRET
        } else if (keyword === 'confidential' || keyword === 'itar' || keyword === 'proprietary') {
          detectedClassificationLevel = SecurityClassification.CONFIDENTIAL
          classificationConfidence = 70; // Medium confidence for auto-detected CONFIDENTIAL
        } else {
          detectedClassificationLevel = SecurityClassification.INTERNAL
          classificationConfidence = 72; // Slightly higher confidence for INTERNAL
        }
        break
      }
    }

    // Check for financial information
    if (text.includes('$') || lowerText.includes('cost') || lowerText.includes('price')) {
      sensitiveDataTypes.push('Financial information')
    }

    // Adjust confidence based on sensitive data detection
    const hasSensitiveData = sensitiveDataTypes.length > 0;
    if (hasSensitiveData && detectedClassificationLevel === SecurityClassification.PUBLIC) {
      // If we found sensitive data but classified as PUBLIC, lower confidence
      classificationConfidence = Math.max(60, classificationConfidence - 10);
    }

    // Generate recommendations based on findings
    if (sensitiveDataTypes.length > 0) {
      recommendations.push('Review document for unnecessary sensitive information')
      recommendations.push('Implement access controls for sensitive data')
      recommendations.push('Consider data redaction for non-essential personnel')
    }

    if (securityRisks.length > 0) {
      recommendations.push('Conduct security review before distribution')
      recommendations.push('Verify recipient authorization levels')
    }

    // Standard government contracting recommendations
    recommendations.push('Ensure compliance with DFARS requirements')
    recommendations.push('Verify proper security markings if required')

    const fallbackResult = {
      classification: detectedClassificationLevel,
      sensitiveDataDetected: hasSensitiveData,
      sensitiveDataTypes,
      securityRisks,
      complianceIssues,
      recommendations,
      confidenceScore: classificationConfidence // Improved confidence calculation
    }

    console.log(`✅ [SECURITY ANALYZER] Fallback analysis result:`, {
      classification: fallbackResult.classification,
      confidenceScore: fallbackResult.confidenceScore,
      sensitiveDataDetected: fallbackResult.sensitiveDataDetected,
      sensitiveDataTypesCount: fallbackResult.sensitiveDataTypes.length
    });

    return fallbackResult;
  }
}

export const documentSecurityAnalyzer = new DocumentSecurityAnalyzer()
