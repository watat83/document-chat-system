import { normalizeError } from '@/lib/errors/normalize-error';
import { BaseAnalyzer } from './base-analyzer'
import { DocumentType } from '@/types/documents'
import { DocumentPromptLibrary } from '@/lib/ai/prompts/document-prompts'
import { ResponseValidators } from '../utils/response-validators'

interface ContentAnalysis {
  summary: string
  keyPoints: string[]
  actionItems: string[]
  questions: string[]
  suggestions: string[]
  sentiment?: 'positive' | 'negative' | 'neutral'
  qualityScore: number
  readabilityScore: number
}

/**
 * Service for analyzing document content and extracting insights
 */
export class DocumentContentAnalyzer extends BaseAnalyzer {
  constructor() {
    super()
  }

  protected getAnalyzerName(): string {
    return 'CONTENT ANALYZER'
  }

  /**
   * Analyze document content and extract key insights
   */
  async analyzeContent(
    extractedText: string,
    documentName: string,
    documentType: DocumentType
  ): Promise<{
    success: boolean
    analysis?: ContentAnalysis
    error?: string
  }> {
    try {
      // Use prompt library to get appropriate prompt based on document type
      const prompt = DocumentPromptLibrary.getContentAnalysisPrompt(
        documentType,
        documentName,
        extractedText
      )

      const response = await this.executeAICompletion(
        prompt,
        'You are an expert document analyst specializing in government contracting. Provide detailed, actionable insights.',
        {
          model: 'gpt-4o',
          maxTokens: 4000,
          temperature: 0.3
        }
      )

      console.log(`🔍 [CONTENT ANALYZER] Raw AI response:`, response.substring(0, 500) + '...');

      const analysis = this.parseContentAnalysis(response, extractedText)
      console.log(`🔍 [CONTENT ANALYZER] Parsed analysis scores:`, {
        qualityScore: analysis.qualityScore,
        readabilityScore: analysis.readabilityScore,
        summaryLength: analysis.summary?.length || 0,
        keyPointsCount: analysis.keyPoints?.length || 0,
        sentiment: analysis.sentiment
      });

      return { success: true, analysis }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Content analysis error:', error)
      console.error('❌ [CONTENT ANALYZER] LLM analysis required - no fallbacks permitted')
      return { success: false, error: error instanceof Error ? error.message : 'Content analysis failed' }
    }
  }

  private parseContentAnalysis(response: string, originalText: string): ContentAnalysis {
    try {
      console.log(`🔍 [CONTENT ANALYZER] Parsing response of length: ${response.length}`);
      console.log(`🔍 [CONTENT ANALYZER] Response preview:`, response.substring(0, 300) + '...');

      const parsed = this.parseJsonResponse(response)

      console.log(`🔍 [CONTENT ANALYZER] Raw parsed values:`, {
        qualityScore: parsed.qualityScore,
        qualityScoreType: typeof parsed.qualityScore,
        readabilityScore: parsed.readabilityScore,
        readabilityScoreType: typeof parsed.readabilityScore,
        summary: parsed.summary?.substring(0, 50) + '...',
        keyPointsLength: parsed.keyPoints?.length,
        sentiment: parsed.sentiment
      });

      // Validate that we have the required fields before processing
      if (parsed.qualityScore === undefined || parsed.readabilityScore === undefined) {
        console.error('❌ [CONTENT ANALYZER] Missing required scores in parsed response');
        console.error('❌ [CONTENT ANALYZER] Available keys:', Object.keys(parsed));
        throw new Error('Missing required quality or readability scores in AI response');
      }

      const result = {
        summary: parsed.summary || ResponseValidators.generateSummary(originalText),
        keyPoints: ResponseValidators.validateStringArray(parsed.keyPoints, 5, 10),
        actionItems: ResponseValidators.validateStringArray(parsed.actionItems, 0, 20),
        questions: ResponseValidators.validateStringArray(parsed.questions, 0, 10),
        suggestions: ResponseValidators.validateStringArray(parsed.suggestions, 3, 5),
        sentiment: ResponseValidators.validateSentiment(parsed.sentiment),
        qualityScore: ResponseValidators.validateScore(parsed.qualityScore, 70),
        readabilityScore: ResponseValidators.validateScore(parsed.readabilityScore, 60)
      }

      console.log(`🔍 [CONTENT ANALYZER] Final validated scores:`, {
        qualityScore: result.qualityScore,
        readabilityScore: result.readabilityScore
      });

      // Extra validation: ensure scores are not zero unless explicitly set
      if (result.qualityScore === 0 || result.readabilityScore === 0) {
        console.error('❌ [CONTENT ANALYZER] CRITICAL: Scores are zero after validation!');
        console.error('❌ [CONTENT ANALYZER] Original values:', {
          originalQuality: parsed.qualityScore,
          originalReadability: parsed.readabilityScore
        });
        throw new Error('Critical error: AI analysis returned zero scores');
      }

      return result

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('❌ [CONTENT ANALYZER] Failed to parse content analysis:', error)
      console.error('❌ [CONTENT ANALYZER] Response that failed to parse:', response.substring(0, 500));

      // Instead of throwing, return meaningful error info for debugging
      throw new Error(`Content analysis parsing failed: ${error.message}. Response preview: ${response.substring(0, 200)}`);
    }
  }


  private generateFallbackAnalysis(text: string): ContentAnalysis {
    // REMOVED: Mathematical scoring fallback as per user requirement
    // This should only be called if LLM analysis completely fails
    throw new Error('LLM-based content analysis is required - mathematical fallbacks not permitted')
  }
}

export const documentContentAnalyzer = new DocumentContentAnalyzer()
