import { z } from 'zod';
import { simpleAIClient } from './services/simple-ai-client'

// Create local interfaces to avoid import issues
interface ScoringCriteriaType {
  relevance: number
  compliance: number
  completeness: number
  technicalMerit: number
  riskAssessment: number
}

interface DocumentScoreType {
  overallScore: number
  criteria: ScoringCriteriaType
  weights: { [key: string]: number }
  confidence: number
  confidenceSource: 'heuristic'
  scoredAt: Date
  scoringModel: string
  processingTimeMs: number
}

export interface DocumentScoringOptions {
  weights?: {
    relevance?: number
    compliance?: number
    completeness?: number
    technicalMerit?: number
    riskAssessment?: number
  }
  aiProvider?: string
  includeAnalysis?: boolean
  documentType?: string
  organizationId?: string
  userId?: string
}

export interface DocumentScoringInput {
  content: string
  title?: string
  documentType?: string
  metadata?: {
    fileName?: string
    fileSize?: number
    pageCount?: number
    wordCount?: number
  }
}

export class DocumentScoringService {
  private static instance: DocumentScoringService

  private constructor() {
    // Using simpleAIClient for consistency with other analyzers
  }

  public static getInstance(): DocumentScoringService {
    if (!DocumentScoringService.instance) {
      DocumentScoringService.instance = new DocumentScoringService()
    }
    return DocumentScoringService.instance
  }

  /**
   * Score a single document using AI analysis
   */
  public async scoreDocument(
    input: DocumentScoringInput,
    options: DocumentScoringOptions = {}
  ): Promise<DocumentScoreType> {
    const startTime = Date.now()

    try {
      // Validate and normalize weights
      const weights = this.normalizeWeights(options.weights)

      // Generate scoring prompt
      const prompt = this.generateScoringPrompt(input, options.documentType, weights)

      // Execute AI completion request using simpleAIClient
      console.log(`🔍 [SCORING SERVICE] Starting AI scoring analysis...`)

      const response = await simpleAIClient.generateCompletion({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 4000, // Increased for more detailed scoring
        temperature: 0.1 // Low temperature for consistent scoring
      })

      console.log(`🔍 [SCORING SERVICE] AI response received: ${response.content?.length || 0} chars`)

      // Parse the AI response into scoring criteria
      const criteria = this.parseAIScoringResponse(response.content)

      // Calculate overall score using weights
      const overallScore = this.calculateOverallScore(criteria, weights)

      // Create document score object
      const documentScore: DocumentScoreType = {
        overallScore,
        criteria,
        weights,
        confidence: this.calculateConfidence(criteria, response),
        confidenceSource: 'heuristic',
        scoredAt: new Date(),
        scoringModel: response.model || 'gpt-4o',
        processingTimeMs: Date.now() - startTime
      }

      return documentScore

    } catch (error) {
      console.error('Document scoring failed:', error)
      throw new Error(`Document scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Perform comprehensive document analysis including scoring
   */
  public async analyzeDocument(
    input: DocumentScoringInput,
    options: DocumentScoringOptions = {}
  ): Promise<any> {
    const startTime = Date.now()

    try {
      // Generate analysis prompt
      const prompt = this.generateAnalysisPrompt(input, options.documentType)

      // Execute AI completion request for analysis using simpleAIClient
      const response = await simpleAIClient.generateCompletion({
        model: 'gpt-4o', // Use consistent model
        messages: [
          {
            role: 'system',
            content: this.getAnalysisSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 4000, // Max tokens for GPT-4 Turbo output
        temperature: 0.2
      })

      // Parse the AI response into analysis results
      const analysis = this.parseAIAnalysisResponse(response.content, input)

      return analysis

    } catch (error) {
      console.error('Document analysis failed:', error)
      throw new Error(`Document analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Score and analyze a document in a single operation
   */
  public async scoreAndAnalyze(
    input: DocumentScoringInput,
    options: DocumentScoringOptions = {}
  ): Promise<{ score: DocumentScoreType; analysis: any }> {
    // Run scoring and analysis in parallel for efficiency
    const [score, analysis] = await Promise.all([
      this.scoreDocument(input, options),
      this.analyzeDocument(input, options)
    ])

    return { score, analysis }
  }

  /**
   * Batch score multiple documents
   */
  public async batchScoreDocuments(
    inputs: DocumentScoringInput[],
    options: DocumentScoringOptions = {},
    concurrency: number = 3
  ): Promise<DocumentScoreType[]> {
    const results: DocumentScoreType[] = []

    // Process in batches to respect concurrency limits
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency)
      const batchPromises = batch.map(input => this.scoreDocument(input, options))

      try {
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
      } catch (error) {
        console.error(`Batch scoring failed for batch starting at index ${i}:`, error)
        // Continue with remaining batches, but add null placeholders for failed batch
        results.push(...Array(batch.length).fill(null))
      }
    }

    return results.filter(Boolean) // Remove null results from failed batches
  }

  /**
   * Normalize and validate scoring weights
   */
  private normalizeWeights(weights?: DocumentScoringOptions['weights']) {
    const defaultWeights = {
      relevance: 0.3,
      compliance: 0.25,
      completeness: 0.2,
      technicalMerit: 0.15,
      riskAssessment: 0.1
    }

    if (!weights) return defaultWeights

    const normalized = { ...defaultWeights, ...weights }
    const total = Object.values(normalized).reduce((sum, weight) => sum + weight, 0)

    // Normalize to sum to 1.0
    if (Math.abs(total - 1.0) > 0.01) {
      Object.keys(normalized).forEach(key => {
        normalized[key as keyof typeof normalized] /= total
      })
    }

    return normalized
  }

  /**
   * Generate AI prompt for document scoring
   */
  private generateScoringPrompt(
    input: DocumentScoringInput,
    documentType?: string,
    weights?: any
  ): string {
    return `
Please analyze and score the following document across multiple criteria. Provide scores from 0-100 for each criterion.

Document Information:
- Title: ${input.title || 'Untitled'}
- Type: ${documentType || 'Unknown'}
- Word Count: ${input.metadata?.wordCount || 'Unknown'}
- File Size: ${input.metadata?.fileSize ? `${Math.round(input.metadata.fileSize / 1024)}KB` : 'Unknown'}

Scoring Criteria:
1. RELEVANCE (Weight: ${((weights?.relevance || 0.3) * 100).toFixed(0)}%): How relevant is this document to government contracting opportunities? Consider alignment with RFP requirements, contract types, and business objectives.

2. COMPLIANCE (Weight: ${((weights?.compliance || 0.25) * 100).toFixed(0)}%): Does the document meet regulatory and compliance requirements? Consider FAR compliance, security requirements, and mandatory certifications.

3. COMPLETENESS (Weight: ${((weights?.completeness || 0.2) * 100).toFixed(0)}%): How complete is the document? Are all required sections present? Is information comprehensive and detailed?

4. TECHNICAL MERIT (Weight: ${((weights?.technicalMerit || 0.15) * 100).toFixed(0)}%): Evaluate the technical quality, innovation, and feasibility of proposed solutions or approaches.

5. RISK ASSESSMENT (Weight: ${((weights?.riskAssessment || 0.1) * 100).toFixed(0)}%): Identify potential risks, challenges, or red flags. Lower scores indicate higher risk.

Document Content:
${input.content}

Please respond with a JSON object containing scores for each criterion:
{
  "relevance": <0-100>,
  "compliance": <0-100>,
  "completeness": <0-100>,
  "technicalMerit": <0-100>,
  "riskAssessment": <0-100>,
  "reasoning": {
    "relevance": "Brief explanation",
    "compliance": "Brief explanation",
    "completeness": "Brief explanation",
    "technicalMerit": "Brief explanation",
    "riskAssessment": "Brief explanation"
  }
}
    `.trim()
  }

  /**
   * Generate AI prompt for document analysis
   */
  private generateAnalysisPrompt(input: DocumentScoringInput, documentType?: string): string {
    return `
Please perform a comprehensive analysis of this government contracting document. Extract key information and provide actionable insights.

Document Information:
- Title: ${input.title || 'Untitled'}
- Type: ${documentType || 'Unknown'}
- Word Count: ${input.metadata?.wordCount || 'Unknown'}

Document Content:
${input.content}

Please provide analysis in the following JSON format:
{
  "keyTerms": ["term1", "term2", "term3"],
  "requirements": ["requirement1", "requirement2"],
  "deadlines": [
    {
      "type": "submission",
      "date": "YYYY-MM-DD or date string",
      "description": "Description of deadline"
    }
  ],
  "opportunities": ["opportunity1", "opportunity2"],
  "risks": ["risk1", "risk2"],
  "summary": "Executive summary of the document",
  "recommendations": ["recommendation1", "recommendation2"],
  "contractAnalysis": {
    "contractType": "Type of contract",
    "estimatedValue": "Value if mentioned",
    "timeline": "Project timeline",
    "requirements": ["req1", "req2"],
    "risks": ["risk1", "risk2"],
    "opportunities": ["opp1", "opp2"]
  },
  "complianceCheck": {
    "status": "compliant|non-compliant|partial",
    "issues": ["issue1", "issue2"],
    "recommendations": ["rec1", "rec2"],
    "lastCheckedAt": "${new Date().toISOString()}"
  },
  "entities": [
    {
      "type": "organization|person|location|date|money|percentage",
      "value": "Entity value"
    }
  ]
}
    `.trim()
  }

  /**
   * Get system prompt for scoring
   */
  private getSystemPrompt(): string {
    return `
You are an expert government contracting analyst specializing in document evaluation and scoring. Your role is to provide accurate, objective assessments of government contracting documents including RFPs, contracts, proposals, and related materials.

Key principles:
- Be objective and consistent in your scoring
- Consider government contracting standards and requirements
- Focus on practical business value and compliance
- Provide clear, actionable reasoning for scores
- Use your expertise in FAR (Federal Acquisition Regulation) and government procurement
    `.trim()
  }

  /**
   * Get system prompt for analysis
   */
  private getAnalysisSystemPrompt(): string {
    return `
You are an expert government contracting analyst with deep knowledge of federal procurement processes, regulations, and best practices. Analyze documents to extract actionable business intelligence for government contractors.

Your expertise includes:
- Federal Acquisition Regulation (FAR) and agency-specific regulations
- Government contracting processes and requirements
- Risk assessment and opportunity identification
- Compliance and certification requirements
- Contract types and structures
- Procurement timelines and deadlines

Provide thorough, accurate analysis that helps contractors make informed business decisions.
    `.trim()
  }

  /**
   * Parse AI scoring response into structured criteria
   */
  private parseAIScoringResponse(content: string): ScoringCriteriaType {
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error('Scoring response did not contain JSON');
    const score = z.number().min(0).max(100);
    return z.object({ relevance: score, compliance: score, completeness: score, technicalMerit: score, riskAssessment: score }).parse(JSON.parse(json));
  }

  /**
   * Parse AI analysis response into structured analysis
   */
  private parseAIAnalysisResponse(content: string, input: DocumentScoringInput): any {
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in AI analysis response')
      }

      const parsed = JSON.parse(jsonMatch[0])

      // Validate and structure the analysis
      const analysis = {
        keyTerms: parsed.keyTerms || [],
        requirements: parsed.requirements || [],
        deadlines: parsed.deadlines || [],
        opportunities: parsed.opportunities || [],
        risks: parsed.risks || [],
        summary: parsed.summary || 'No summary available',
        recommendations: parsed.recommendations || [],
        contractAnalysis: parsed.contractAnalysis || undefined,
        complianceCheck: parsed.complianceCheck || undefined,
        entities: parsed.entities || []
      }

      return analysis

    } catch (error) {
      console.error('Failed to parse AI analysis response:', error)
      // Return minimal analysis if parsing fails
      return {
        keyTerms: [],
        requirements: [],
        deadlines: [],
        opportunities: [],
        risks: [],
        summary: `Analysis failed for document: ${input.title || 'Untitled'}`,
        recommendations: ['Review document manually for key requirements'],
        entities: []
      }
    }
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(criteria: ScoringCriteriaType, weights: { [key: string]: number }): number {
    const weightedScore =
      (criteria.relevance * weights.relevance) +
      (criteria.compliance * weights.compliance) +
      (criteria.completeness * weights.completeness) +
      (criteria.technicalMerit * weights.technicalMerit) +
      (criteria.riskAssessment * weights.riskAssessment)

    return Math.round(weightedScore * 100) / 100 // Round to 2 decimal places
  }

  /**
   * Calculate confidence level based on AI response quality
   */
  private calculateConfidence(criteria: ScoringCriteriaType, response: any): number {
    // Base confidence on score variance and response quality indicators
    const scores = [criteria.relevance, criteria.compliance, criteria.completeness, criteria.technicalMerit, criteria.riskAssessment]
    const variance = this.calculateVariance(scores)
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length

    // Lower variance and reasonable average scores indicate higher confidence
    const varianceConfidence = Math.max(0, 1 - (variance / 1000)) // Normalize variance
    const rangeConfidence = avgScore > 10 && avgScore < 90 ? 0.8 : 0.6 // Extreme scores less confident

    return Math.min(0.95, Math.max(0.3, (varianceConfidence + rangeConfidence) / 2))
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length
    const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length
    return variance
  }

  /**
   * Clamp score to valid range (0-100)
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)))
  }
}
