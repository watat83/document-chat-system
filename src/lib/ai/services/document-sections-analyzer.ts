import { simpleAIClient } from './simple-ai-client'
import { DocumentSection, DocumentType } from '@/types/documents'
import { DocumentPromptLibrary } from '@/lib/ai/prompts/document-prompts'

/**
 * Service for analyzing document structure and creating sections
 */
export class DocumentSectionsAnalyzer {
  constructor() {
    // No initialization needed for simple client
  }

  /**
   * Analyze document text and create structured sections
   */
  async analyzeSections(
    extractedText: string,
    documentName: string,
    documentType: DocumentType = 'OTHER'
  ): Promise<{
    success: boolean
    sections?: DocumentSection[]
    error?: string
  }> {
    try {
      console.log(
        `🚀 [SECTIONS] Starting AI section analysis for "${documentName}" (${extractedText.length} chars)`
      )
      console.log(`📋 [SECTIONS] Document type: ${documentType}`)

      // Create optimized prompt for section analysis
      const prompt = this.createSectionAnalysisPrompt(
        documentType,
        documentName,
        extractedText
      )

      console.log(
        `📝 [SECTIONS] Generated prompt length: ${prompt.length} characters`
      )
      console.log(`🤖 [SECTIONS] Calling AI service with model: gpt-4`)

      const result = await simpleAIClient.generateCompletion({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert document structure analyzer. Extract and organize document sections logically for any type of business document.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        maxTokens: 4000,
        temperature: 0.3,
      })

      console.log(`📥 [SECTIONS] AI response received:`, {
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        contentPreview: result.content?.substring(0, 150) || 'No content',
      })

      if (!result.content) {
        throw new Error('No response from AI service')
      }

      // Parse the JSON response
      console.log('🔍 [SECTIONS] Parsing AI response...')
      const sections = this.parseSectionsResponse(result.content)

      // If no sections were identified, create intelligent fallback based on original document
      if (sections.length === 0) {
        console.log(
          '⚠️ [SECTIONS] No sections found, creating intelligent fallback from original document'
        )
        const intelligentSections = this.createIntelligentSections(
          extractedText,
          documentName
        )
        sections.push(...intelligentSections)
      }

      return { success: true, sections }
    } catch (error) {
      console.error('❌ [SECTIONS] AI section analysis failed:', error)
      console.error('❌ [SECTIONS] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        documentName,
        textLength: extractedText?.length || 0,
      })

      // Create intelligent fallback sections if AI fails
      console.log(
        '🔄 [SECTIONS] AI analysis failed, falling back to intelligent text-based section analysis...'
      )
      const fallbackSections = this.createIntelligentSections(
        extractedText,
        documentName
      )

      console.log(
        `✅ [SECTIONS] Fallback complete: created ${fallbackSections.length} sections`
      )

      return {
        success: true, // Return success with fallback data
        sections: fallbackSections,
      }
    }
  }

  private parseSectionsResponse(response: string): DocumentSection[] {
    try {
      console.log(
        '🔍 [SECTIONS] Parsing AI response:',
        response.substring(0, 200) + '...'
      )

      // First, try to find and parse JSON from the response
      let jsonString = ''

      // Method 1: Look for JSON array in the response
      const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (jsonMatch) {
        jsonString = jsonMatch[0]
        console.log('✅ [SECTIONS] Found JSON array using regex')
      } else {
        // Method 2: Look for JSON between code blocks
        const codeBlockMatch = response.match(
          /```(?:json)?\s*(\[[\s\S]*?\])\s*```/
        )
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1]
          console.log('✅ [SECTIONS] Found JSON in code block')
        } else {
          // Method 3: Try to extract any valid JSON array
          const lines = response.split('\n')
          const jsonLines: string[] = []
          let inArray = false
          let bracketCount = 0

          for (const line of lines) {
            if (line.trim().startsWith('[')) {
              inArray = true
              bracketCount = 0
            }

            if (inArray) {
              jsonLines.push(line)
              // Count brackets to find end of array
              for (const char of line) {
                if (char === '[') bracketCount++
                if (char === ']') bracketCount--
              }

              if (bracketCount === 0 && line.includes(']')) {
                break
              }
            }
          }

          jsonString = jsonLines.join('\n')
          console.log('🔄 [SECTIONS] Extracted JSON using line parsing')
        }
      }

      if (!jsonString || jsonString.trim() === '') {
        throw new Error('No JSON found in response')
      }

      console.log(
        '🔍 [SECTIONS] Attempting to parse JSON:',
        jsonString.substring(0, 100) + '...'
      )
      const parsed = JSON.parse(jsonString)

      if (!Array.isArray(parsed)) {
        throw new Error('Parsed JSON is not an array')
      }

      const sections = parsed.map((section: any, index: number) => ({
        title:
          section.title ||
          section.name ||
          section.heading ||
          `Section ${index + 1}`,
        content: section.content || section.text || section.body || '',
        pageNumber: section.pageNumber || section.page || 1,
      }))

      console.log(
        `✅ [SECTIONS] Successfully parsed ${sections.length} sections from AI response`
      )
      sections.forEach((section, i) => {
        console.log(
          `   ${i + 1}. "${section.title}" (${section.content.length} chars)`
        )
      })

      return sections
    } catch (error) {
      console.error('❌ [SECTIONS] Failed to parse AI response as JSON:', error)
      console.error(
        '❌ [SECTIONS] Response content:',
        response.substring(0, 500)
      )

      // CRITICAL FIX: Return empty array to trigger intelligent fallback
      // This prevents storing raw JSON as section content
      return [] // Empty array triggers intelligent fallback with original text
    }
  }

  private fallbackSectionParsing(text: string): DocumentSection[] {
    console.log('🔄 [SECTIONS] Using text-based fallback section parsing')
    const sections: DocumentSection[] = []
    const lines = text.split('\n')

    let currentSection: DocumentSection | null = null
    let contentLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // Look for section headers (lines that look like titles)
      if (this.looksLikeHeader(trimmed)) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentLines.join('\n').trim()
          if (currentSection.content) {
            sections.push(currentSection)
          }
        }

        // Start new section
        currentSection = {
          title: trimmed.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, ''),
          content: '',
          pageNumber: 1,
        }
        contentLines = []
      } else if (currentSection && trimmed) {
        contentLines.push(line) // Keep original formatting including indentation
      } else if (!currentSection && trimmed) {
        // Content before any header - start an initial section
        if (!currentSection) {
          currentSection = {
            title: 'Document Content',
            content: '',
            pageNumber: 1,
          }
        }
        contentLines.push(line)
      }
    }

    // Add final section
    if (currentSection && contentLines.length > 0) {
      currentSection.content = contentLines.join('\n').trim()
      sections.push(currentSection)
    }

    console.log(
      `🔍 [SECTIONS] Fallback parsing result: ${sections.length} sections`
    )
    sections.forEach((section, i) => {
      console.log(
        `   ${i + 1}. "${section.title}" (${section.content.length} chars)`
      )
    })

    return sections
  }

  private looksLikeHeader(line: string): boolean {
    // Check if line looks like a header
    return (
      // Markdown headers
      (/^#+\s+/.test(line) ||
      // Numbered headers
      /^\d+\.\s+[A-Z]/.test(line) ||
      // All caps headers
      /^[A-Z\s]{3,}$/.test(line) ||
      // Title case headers (short lines)
      (line.length < 100 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line)) ||
      // Headers ending with colon
      /^[A-Z][^.!?]*:$/.test(line) || // Headers with common section words
      /^(Executive Summary|Introduction|Background|Overview|Conclusion|Summary|Appendix|Table of Contents|References)/i.test(
        line
      ))
    );
  }

  /**
   * Create intelligent sections from document text when AI fails
   */
  private createIntelligentSections(
    extractedText: string,
    documentName: string
  ): DocumentSection[] {
    console.log(
      '🧠 [SECTIONS] Creating intelligent sections from document text'
    )

    // First try text-based parsing - this should work for most structured documents
    const textSections = this.fallbackSectionParsing(extractedText)

    // If we found multiple sections, always use them regardless of document length
    if (textSections.length > 1) {
      console.log(
        `✅ [SECTIONS] Found ${textSections.length} sections using text parsing`
      )
      return textSections
    }

    console.log(
      `⚠️ [SECTIONS] Text parsing found only ${textSections.length} section(s), trying alternative approaches...`
    )

    // If only one section found, try to split intelligently by content analysis
    const words = extractedText.split(/\s+/).filter((w) => w.length > 0)
    const totalWords = words.length

    console.log(
      `📊 [SECTIONS] Document stats: ${totalWords} words, ${extractedText.length} characters`
    )

    // For very short documents (< 50 words), just use single section
    if (totalWords < 50) {
      console.log('📄 [SECTIONS] Very short document - using single section')
      return [
        {
          title: this.generateSectionTitle(extractedText, documentName),
          content: extractedText,
          pageNumber: 1,
        },
      ]
    }

    // For longer documents, try to split by paragraphs even if no clear headers were found
    const paragraphs = extractedText
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 50) // Only include substantial paragraphs

    console.log(`📝 [SECTIONS] Found ${paragraphs.length} paragraphs`)

    // If we have multiple substantial paragraphs, try to create sections from them
    if (paragraphs.length >= 2) {
      console.log(
        `📖 [SECTIONS] Attempting to create sections from ${paragraphs.length} paragraphs`
      )

      const sections: DocumentSection[] = []
      // Intelligent section creation based on document length and content
      const targetSections = this.calculateOptimalSectionCount(totalWords, paragraphs.length)
      const paragraphsPerSection = Math.max(
        1,
        Math.floor(paragraphs.length / targetSections)
      )

      let sectionCount = 1
      let currentSectionParagraphs: string[] = []

      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i]
        currentSectionParagraphs.push(paragraph)

        // Create section when we have enough paragraphs or reach the end
        if (
          currentSectionParagraphs.length >= paragraphsPerSection ||
          i === paragraphs.length - 1
        ) {
          const sectionContent = currentSectionParagraphs.join('\n\n')
          const firstLine = currentSectionParagraphs[0].split('\n')[0].trim()

          // Try to generate a meaningful title from the first line or paragraph content
          let sectionTitle = `Section ${sectionCount}`

          if (this.looksLikeHeader(firstLine)) {
            sectionTitle = firstLine
          } else {
            // Try to generate title from content keywords
            sectionTitle = this.generateSmartSectionTitle(
              sectionContent,
              sectionCount,
              documentName
            )
          }

          sections.push({
            title: sectionTitle,
            content: sectionContent,
            pageNumber: 1,
          })

          currentSectionParagraphs = []
          sectionCount++
        }
      }

      if (sections.length > 1) {
        console.log(
          `✅ [SECTIONS] Created ${sections.length} sections from paragraph analysis`
        )
        return sections
      }
    }

    // If text parsing found exactly one section with meaningful content, use it
    if (
      textSections.length === 1 &&
      textSections[0].content.trim().length > 0
    ) {
      console.log(
        '✅ [SECTIONS] Using single section from text parsing with meaningful content'
      )
      return textSections
    }

    // Final fallback - single section with descriptive title
    console.log('📝 [SECTIONS] Using single section fallback')
    return [
      {
        title: this.generateSectionTitle(extractedText, documentName),
        content: extractedText,
        pageNumber: 1,
      },
    ]
  }

  /**
   * Generate a smart section title from content analysis
   */
  private generateSmartSectionTitle(
    content: string,
    sectionNumber: number,
    documentName: string
  ): string {
    const text = content.toLowerCase()
    const firstSentence = content.split(/[.!?]+/)[0]?.trim() || ''

    // Common section keywords and their titles
    const sectionPatterns = [
      {
        keywords: ['executive summary', 'overview', 'abstract'],
        title: 'Executive Summary',
      },
      {
        keywords: ['introduction', 'background', 'context'],
        title: 'Introduction',
      },
      {
        keywords: ['scope of work', 'statement of work', 'sow', 'requirements'],
        title: 'Scope of Work',
      },
      {
        keywords: ['technical', 'specification', 'architecture', 'design'],
        title: 'Technical Approach',
      },
      {
        keywords: ['budget', 'cost', 'pricing', 'financial', 'price'],
        title: 'Budget and Pricing',
      },
      {
        keywords: ['timeline', 'schedule', 'milestones', 'deliverables'],
        title: 'Timeline and Deliverables',
      },
      {
        keywords: ['personnel', 'team', 'staff', 'resources'],
        title: 'Team and Personnel',
      },
      {
        keywords: [
          'experience',
          'past performance',
          'references',
          'qualifications',
        ],
        title: 'Past Performance',
      },
      {
        keywords: ['management', 'approach', 'methodology', 'process'],
        title: 'Management Approach',
      },
      {
        keywords: ['risk', 'mitigation', 'challenges', 'issues'],
        title: 'Risk Management',
      },
      {
        keywords: ['conclusion', 'summary', 'final', 'closing'],
        title: 'Conclusion',
      },
      {
        keywords: ['appendix', 'attachment', 'exhibit', 'reference'],
        title: 'Appendix',
      },
    ]

    // Check for pattern matches
    for (const pattern of sectionPatterns) {
      if (pattern.keywords.some((keyword) => text.includes(keyword))) {
        return pattern.title
      }
    }

    // If first sentence looks like a title (short and starts with capital), use it
    if (
      firstSentence.length > 5 &&
      firstSentence.length < 80 &&
      /^[A-Z]/.test(firstSentence)
    ) {
      return firstSentence.replace(/[.!?]+$/, ''); // Remove trailing punctuation
    }

    // Default section numbering with document context
    if (documentName?.toLowerCase().includes('proposal')) {
      return `Proposal Section ${sectionNumber}`
    } else if (documentName?.toLowerCase().includes('contract')) {
      return `Contract Section ${sectionNumber}`
    } else if (documentName?.toLowerCase().includes('rfp')) {
      return `RFP Section ${sectionNumber}`
    }

    return `Section ${sectionNumber}`
  }

  /**
   * Calculate optimal number of sections based on document characteristics
   */
  private calculateOptimalSectionCount(wordCount: number, paragraphCount: number): number {
    // Very short documents: 1 section
    if (wordCount < 200) return 1

    // Short documents: 2 sections
    if (wordCount < 500) return 2

    // Medium documents: 2-4 sections
    if (wordCount < 2000) {
      return Math.min(4, Math.max(2, Math.floor(paragraphCount / 2)))
    }

    // Long documents: 3-6 sections
    if (wordCount < 5000) {
      return Math.min(6, Math.max(3, Math.floor(paragraphCount / 3)))
    }

    // Very long documents: 4-8 sections
    return Math.min(8, Math.max(4, Math.floor(paragraphCount / 4)))
  }

  /**
   * Create optimized section analysis prompt
   */
  private createSectionAnalysisPrompt(
    documentType: DocumentType,
    documentName: string,
    extractedText: string
  ): string {
    const textLength = extractedText.length
    const wordCount = extractedText.split(/\s+/).length

    return `Analyze this ${documentType.toLowerCase()} document and create well-structured, meaningful sections.

Document: ${documentName}
Document Type: ${documentType}
Length: ${wordCount} words

CREATE LOGICAL SECTIONS:
1. Analyze the document structure and identify natural section breaks
2. Create 2-6 sections with meaningful, descriptive titles
3. Each section should contain substantial, complete content
4. Avoid fragmenting related information
5. Ensure each section tells a coherent part of the story

SECTION QUALITY REQUIREMENTS:
- Each section must have at least 100 words of content
- Section titles should be descriptive and professional
- Content should be complete sentences and paragraphs
- Preserve original formatting and structure where possible
- Focus on extracting key information and actionable insights

RETURN FORMAT - JSON Array:
[
  {
    "title": "Executive Summary",
    "content": "Complete, well-formatted content with full sentences and paragraphs. Include all relevant details from this section of the document.",
    "pageNumber": 1
  },
  {
    "title": "Technical Requirements",
    "content": "Complete technical information with specific requirements, specifications, and details from the document.",
    "pageNumber": 1
  }
]

Document Text:
${extractedText}`
  }

  /**
   * Generate a meaningful section title based on content analysis
   */
  private generateSectionTitle(content: string, documentName: string): string {
    // Extract first meaningful line or use document name
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length > 0) {
      const firstLine = lines[0]

      // If first line looks like a title, use it
      if (
        firstLine.length < 100 &&
        !firstLine.includes('.') &&
        /^[A-Z]/.test(firstLine)
      ) {
        return firstLine
      }
    }

    // Analyze content for key terms to generate a better title
    const text = content.toLowerCase()

    if (text.includes('executive summary') || text.includes('overview')) {
      return 'Executive Summary'
    } else if (text.includes('introduction') || text.includes('background')) {
      return 'Introduction'
    } else if (text.includes('conclusion') || text.includes('summary')) {
      return 'Summary'
    } else if (text.includes('proposal') || text.includes('rfp')) {
      return 'Proposal Details'
    } else if (text.includes('contract') || text.includes('agreement')) {
      return 'Contract Information'
    } else if (text.includes('technical') || text.includes('specification')) {
      return 'Technical Details'
    } else if (
      text.includes('budget') ||
      text.includes('cost') ||
      text.includes('price')
    ) {
      return 'Budget and Pricing'
    }

    // Default to document name or generic title
    return documentName ? `${documentName} - Content` : 'Document Content'
  }
}

export const documentSectionsAnalyzer = new DocumentSectionsAnalyzer()
