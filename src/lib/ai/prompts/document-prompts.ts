import { DocumentType } from '@/types/documents'

/**
 * Prompt library for document analysis based on document type
 * Provides specialized prompts for different document types
 */
export class DocumentPromptLibrary {
  /**
   * Get section analysis prompt based on document type
   */
  static getSectionAnalysisPrompt(
    documentType: DocumentType | 'RFP' | 'INVOICE' | 'REPORT' | 'GENERAL',
    documentName: string,
    extractedText: string
  ): string {
    const basePrompt = `Document Name: ${documentName}\n\n`

    switch (documentType) {
      case 'SOLICITATION':
      case 'RFP':
        return (
          basePrompt +
          this.getRFPSectionPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'CONTRACT':
        return (
          basePrompt +
          this.getContractSectionPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'PROPOSAL':
        return (
          basePrompt +
          this.getProposalSectionPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'INVOICE':
        return (
          basePrompt +
          this.getInvoiceSectionPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'REPORT':
        return (
          basePrompt +
          this.getReportSectionPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'GENERAL':
      case 'OTHER':
      default:
        return (
          basePrompt +
          this.getGeneralSectionPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )
    }
  }

  /**
   * Get entity extraction prompt for DocumentEntities interface
   */
  static getEntityExtractionPrompt(
    documentType: DocumentType | 'RFP' | 'INVOICE' | 'REPORT' | 'GENERAL',
    documentName: string,
    extractedText: string
  ): string {
    const basePrompt = `Extract entities from this ${documentType} document.\n\nDocument Name: ${documentName}\n\n`

    return basePrompt + this.getEntityExtractionTemplate() + `\n\nDocument Text:\n${extractedText}`
  }

  /**
   * Get content analysis prompt based on document type
   */
  static getContentAnalysisPrompt(
    documentType: DocumentType | 'RFP' | 'INVOICE' | 'REPORT' | 'GENERAL',
    documentName: string,
    extractedText: string
  ): string {
    const basePrompt = `Analyze this ${documentType} document and provide comprehensive insights.\n\nDocument Name: ${documentName}\n\n`

    switch (documentType) {
      case 'SOLICITATION':
      case 'RFP':
        return (
          basePrompt +
          this.getRFPContentPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'CONTRACT':
        return (
          basePrompt +
          this.getContractContentPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'PROPOSAL':
        return (
          basePrompt +
          this.getProposalContentPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'INVOICE':
        return (
          basePrompt +
          this.getInvoiceContentPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'REPORT':
        return (
          basePrompt +
          this.getReportContentPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )

      case 'GENERAL':
      case 'OTHER':
      default:
        return (
          basePrompt +
          this.getGeneralContentPrompt() +
          `\n\nDocument Text:\n${extractedText}`
        )
    }
  }

  /**
   * RFP-specific section prompt
   */
  private static getRFPSectionPrompt(): string {
    return `Analyze this Request for Proposal (RFP) and identify its sections.

For each section, provide ALL required fields:
1. id - Generate unique identifier (e.g., "executive-summary", "scope-of-work")
2. title - Clear section heading
3. content - Well-formatted text content
4. pageNumber - Page number if identifiable (or null)
5. sectionOrder - Sequential numbering starting from 1
6. sectionType - Use "HEADER", "CONTENT", "FOOTER", or "APPENDIX"
7. parentId - null for top-level sections
8. level - 1 for main sections, 2+ for subsections

Focus on typical RFP sections:
- Executive Summary
- Background/Introduction
- Scope of Work
- Technical Requirements
- Evaluation Criteria
- Submission Instructions
- Timeline/Key Dates
- Terms and Conditions
- Attachments/Appendices

CRITICAL: You MUST return ONLY a valid JSON array. No additional text, explanations, or formatting.

Return as JSON array with ALL required fields:
[
  {
    "id": "executive-summary",
    "title": "Executive Summary",
    "content": "Formatted content with proper paragraphs\\n\\nNext paragraph...",
    "pageNumber": 1,
    "sectionOrder": 1,
    "sectionType": "CONTENT",
    "parentId": null,
    "level": 1
  }
]

RETURN ONLY THE JSON ARRAY - NO OTHER TEXT.`
  }

  /**
   * Contract-specific section prompt
   */
  private static getContractSectionPrompt(): string {
    return `Analyze this contract document and identify its sections.

For each section, provide ALL required fields:
1. id - Generate unique identifier (e.g., "parties-recitals", "payment-terms")
2. title - Clear section heading
3. content - Well-formatted text content
4. pageNumber - Page number if identifiable (or null)
5. sectionOrder - Sequential numbering starting from 1
6. sectionType - Use "HEADER", "CONTENT", "FOOTER", or "APPENDIX"
7. parentId - null for top-level sections
8. level - 1 for main sections, 2+ for subsections

Focus on typical contract sections:
- Parties/Recitals
- Definitions
- Scope of Work/Services
- Payment Terms
- Deliverables
- Timeline/Schedule
- Terms and Conditions
- Warranties
- Termination Clauses
- Signatures

CRITICAL: You MUST return ONLY a valid JSON array. No additional text, explanations, or formatting.

Return as JSON array with ALL required fields:
[
  {
    "id": "parties-recitals",
    "title": "Parties and Recitals",
    "content": "Formatted content with proper paragraphs\\n\\nNext paragraph...",
    "pageNumber": 1,
    "sectionOrder": 1,
    "sectionType": "CONTENT",
    "parentId": null,
    "level": 1
  }
]

RETURN ONLY THE JSON ARRAY - NO OTHER TEXT.`
  }

  /**
   * Proposal-specific section prompt
   */
  private static getProposalSectionPrompt(): string {
    return `Analyze this proposal document and identify its sections.

For each section, provide ALL required fields:
1. id - Generate unique identifier (e.g., "executive-summary", "technical-approach")
2. title - Clear section heading
3. content - Well-formatted text content
4. pageNumber - Page number if identifiable (or null)
5. sectionOrder - Sequential numbering starting from 1
6. sectionType - Use "HEADER", "CONTENT", "FOOTER", or "APPENDIX"
7. parentId - null for top-level sections
8. level - 1 for main sections, 2+ for subsections

Focus on typical proposal sections:
- Executive Summary
- Company Overview
- Understanding of Requirements
- Technical Approach
- Management Approach
- Past Performance
- Staffing Plan
- Pricing/Cost
- Risk Management
- Conclusion

CRITICAL: You MUST return ONLY a valid JSON array. No additional text, explanations, or formatting.

Return as JSON array with ALL required fields:
[
  {
    "id": "executive-summary",
    "title": "Executive Summary",
    "content": "Formatted content with proper paragraphs\\n\\nNext paragraph...",
    "pageNumber": 1,
    "sectionOrder": 1,
    "sectionType": "CONTENT",
    "parentId": null,
    "level": 1
  }
]

RETURN ONLY THE JSON ARRAY - NO OTHER TEXT.`
  }

  /**
   * Invoice-specific section prompt
   */
  private static getInvoiceSectionPrompt(): string {
    return `Analyze this invoice document and extract its components.

For each component, provide ALL required fields:
1. id - Generate unique identifier (e.g., "invoice-header", "line-items")
2. title - Component name
3. content - Extracted information
4. pageNumber - Page number if identifiable (or null)
5. sectionOrder - Sequential numbering starting from 1
6. sectionType - Use "HEADER", "CONTENT", "FOOTER", or "APPENDIX"
7. parentId - null for top-level sections
8. level - 1 for main sections, 2+ for subsections

Focus on invoice components:
- Invoice Header (Number, Date)
- Billing Information
- Recipient Information
- Line Items/Services
- Subtotal
- Taxes
- Total Amount
- Payment Terms
- Notes/Comments

CRITICAL: You MUST return ONLY a valid JSON array. No additional text, explanations, or formatting.

Return as JSON array with ALL required fields:
[
  {
    "id": "invoice-header",
    "title": "Invoice Header",
    "content": "Invoice information with proper formatting",
    "pageNumber": 1,
    "sectionOrder": 1,
    "sectionType": "HEADER",
    "parentId": null,
    "level": 1
  }
]

RETURN ONLY THE JSON ARRAY - NO OTHER TEXT.`
  }

  /**
   * Report-specific section prompt
   */
  private static getReportSectionPrompt(): string {
    return `Analyze this report document and identify its sections.

For each section, provide ALL required fields:
1. id - Generate unique identifier (e.g., "executive-summary", "methodology")
2. title - Clear section heading
3. content - Well-formatted text content
4. pageNumber - Page number if identifiable (or null)
5. sectionOrder - Sequential numbering starting from 1
6. sectionType - Use "HEADER", "CONTENT", "FOOTER", or "APPENDIX"
7. parentId - null for top-level sections
8. level - 1 for main sections, 2+ for subsections

Focus on typical report sections:
- Executive Summary
- Introduction/Background
- Methodology
- Findings/Results
- Analysis
- Recommendations
- Conclusion
- References
- Appendices

CRITICAL: You MUST return ONLY a valid JSON array. No additional text, explanations, or formatting.

Return as JSON array with ALL required fields:
[
  {
    "id": "executive-summary",
    "title": "Executive Summary",
    "content": "Formatted content with proper paragraphs\\n\\nNext paragraph...",
    "pageNumber": 1,
    "sectionOrder": 1,
    "sectionType": "CONTENT",
    "parentId": null,
    "level": 1
  }
]

RETURN ONLY THE JSON ARRAY - NO OTHER TEXT.`
  }

  /**
   * General document section prompt - flexible, AI-driven structure
   */
  private static getGeneralSectionPrompt(): string {
    return `Analyze this document and intelligently identify its logical sections based on the content structure.

DO NOT force the document into predefined sections. Instead:
- Let the document's natural structure guide your analysis
- Identify sections based on topic changes, formatting cues, or logical breaks
- Create meaningful section titles that reflect the actual content
- Preserve the document's original organization

For each section you identify, provide ALL required fields:
1. id - Generate unique identifier based on content (e.g., "introduction", "main-content")
2. title - A descriptive title that accurately reflects the section's content
3. content - Well-formatted text preserving the original meaning and structure
4. pageNumber - Estimated page number if identifiable (or null)
5. sectionOrder - Sequential numbering starting from 1
6. sectionType - Use "HEADER", "CONTENT", "FOOTER", or "APPENDIX"
7. parentId - null for top-level sections
8. level - 1 for main sections, 2+ for subsections

IMPORTANT:
- Be flexible and adaptive to the document's actual structure
- Don't create artificial sections if the document is continuous
- Respect the author's original organization
- If the document has no clear sections, you can return it as a single section

CRITICAL: You MUST return ONLY a valid JSON array. No additional text, explanations, or formatting.

Return as JSON array with ALL required fields:
[
  {
    "id": "main-content",
    "title": "Document Content",
    "content": "Well-formatted section content with proper paragraphs\\n\\nNext paragraph...",
    "pageNumber": 1,
    "sectionOrder": 1,
    "sectionType": "CONTENT",
    "parentId": null,
    "level": 1
  }
]

RETURN ONLY THE JSON ARRAY - NO OTHER TEXT.`
  }

  /**
   * RFP-specific content analysis prompt
   */
  private static getRFPContentPrompt(): string {
    return `Analyze this Request for Proposal (RFP) document.

CRITICAL: You MUST return a valid JSON object with all required fields. No additional text or explanations.

Required JSON structure:
{
  "summary": "Executive summary of the RFP opportunity",
  "keyPoints": ["Key requirement 1", "Key requirement 2", "Evaluation factor 1"],
  "actionItems": ["Required submission 1", "Compliance item 1", "Action 2"],
  "questions": ["Area needing clarification 1", "Question 2"] or [],
  "suggestions": ["Recommendation 1", "Proposal strategy 2", "Approach 3"],
  "sentiment": "positive" or "negative" or "neutral",
  "qualityScore": (1-100),
  "readabilityScore": (1-100),
  "submissionDeadline": "Date if found" or null,
  "contractValue": "Value if mentioned" or null,
  "setAsideStatus": "Set-aside info" or null,
  "evaluationCriteria": ["Criteria 1", "Criteria 2"] or [],
  "incumbentInfo": "Current contractor info" or null
}

Analysis Guidelines:
- qualityScore: RFP quality and clarity (1-100)
- readabilityScore: RFP readability (1-100)
- sentiment: Overall opportunity assessment
- Extract specific RFP information where available
- Use null for unavailable information

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }

  /**
   * Contract-specific content analysis prompt - matches DocumentAnalysis interface
   */
  private static getContractContentPrompt(): string {
    return `Analyze this contract document and provide structured analysis.

CRITICAL: You MUST return a valid JSON object matching the DocumentAnalysis interface. No additional text or explanations.

Required JSON structure with DocumentAnalysis fields:
{
  "contract": {
    "id": "unique-contract-analysis-id",
    "contractType": "FIXED_PRICE" | "COST_PLUS" | "TIME_AND_MATERIALS" | "INDEFINITE_DELIVERY" | "OTHER",
    "estimatedValue": "Total contract value if found" | null,
    "timeline": "Contract duration or timeline" | null,
    "requirements": ["Key requirement 1", "Key requirement 2"],
    "risks": ["Risk factor 1", "Risk factor 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"],
    "keyTerms": ["Important term 1", "Important term 2"],
    "deadlines": ["2024-12-31", "2025-03-15"] | null,
    "parties": ["Party 1 name", "Party 2 name"],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "compliance": {
    "id": "unique-compliance-check-id",
    "status": "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL" | "PENDING" | "UNKNOWN",
    "issues": ["Compliance issue 1", "Issue 2"],
    "recommendations": ["Recommendation 1", "Recommendation 2"],
    "checkVersion": "v1.0",
    "checkType": "contract-analysis",
    "complianceScore": 85,
    "lastCheckedAt": "2024-01-01T00:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}

Analysis Guidelines:
- contractType: Use exact enum values from ContractType
- complianceScore: 1-100 based on regulatory compliance
- Use current ISO timestamp for dates
- Use null for unavailable information
- Generate unique IDs for contract and compliance objects

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }

  /**
   * Proposal-specific content analysis prompt
   */
  private static getProposalContentPrompt(): string {
    return `Analyze this proposal document.

CRITICAL: You MUST return a valid JSON object with all required fields. No additional text or explanations.

Required JSON structure:
{
  "summary": "Executive summary of the proposal",
  "keyPoints": ["Key solution 1", "Key differentiator 1", "Strength 1"],
  "actionItems": ["Client action 1", "Required action 1"] or [],
  "questions": ["Area needing client input 1", "Question 2"] or [],
  "suggestions": ["Proposal improvement 1", "Recommendation 2", "Strategy 3"],
  "sentiment": "positive" or "negative" or "neutral",
  "qualityScore": (1-100),
  "readabilityScore": (1-100),
  "proposedValue": "Total proposed price" or null,
  "technicalScore": (1-100),
  "managementScore": (1-100),
  "pastPerformanceScore": (1-100),
  "competitiveAdvantages": ["Advantage 1", "Advantage 2"] or []
}

Analysis Guidelines:
- sentiment: Win probability assessment (positive/negative/neutral)
- qualityScore: Proposal quality and persuasiveness (1-100)
- readabilityScore: Proposal clarity (1-100)
- technicalScore: Technical approach strength (1-100)
- managementScore: Management approach strength (1-100)
- pastPerformanceScore: Past performance strength (1-100)
- Use null for unavailable information

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }

  /**
   * Invoice-specific content analysis prompt
   */
  private static getInvoiceContentPrompt(): string {
    return `Analyze this invoice document.

CRITICAL: You MUST return a valid JSON object with all required fields. No additional text or explanations.

Required JSON structure:
{
  "summary": "Invoice summary",
  "keyPoints": ["Key billing item 1", "Billing item 2", "Item 3"],
  "actionItems": ["Payment requirement 1", "Action 2"] or [],
  "questions": ["Billing discrepancy 1", "Question 2"] or [],
  "suggestions": ["Payment optimization 1", "Suggestion 2", "Recommendation 3"],
  "sentiment": "neutral",
  "qualityScore": (1-100),
  "readabilityScore": (1-100),
  "invoiceNumber": "Invoice identifier" or null,
  "invoiceDate": "Invoice date" or null,
  "dueDate": "Payment due date" or null,
  "totalAmount": "Total amount due" or null,
  "taxAmount": "Tax amount" or null,
  "paymentStatus": "Current payment status" or null
}

Analysis Guidelines:
- sentiment: Always "neutral" for invoices
- qualityScore: Invoice accuracy and completeness (1-100)
- readabilityScore: Invoice clarity (1-100)
- Extract specific invoice information where available
- Use null for unavailable information

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }

  /**
   * Report-specific content analysis prompt
   */
  private static getReportContentPrompt(): string {
    return `Analyze this report document.

CRITICAL: You MUST return a valid JSON object with all required fields. No additional text or explanations.

Required JSON structure:
{
  "summary": "Executive summary of findings",
  "keyPoints": ["Key finding 1", "Key insight 1", "Finding 2"],
  "actionItems": ["Recommended action 1", "Action 2"] or [],
  "questions": ["Area needing research 1", "Question 2"] or [],
  "suggestions": ["Implementation recommendation 1", "Suggestion 2", "Recommendation 3"],
  "sentiment": "positive" or "negative" or "neutral",
  "qualityScore": (1-100),
  "readabilityScore": (1-100),
  "reportType": "Type of report" or null,
  "dateRange": "Period covered by report" or null,
  "keyMetrics": ["Metric 1", "KPI 2"] or [],
  "trends": ["Trend 1", "Trend 2"] or [],
  "risks": ["Risk 1", "Risk 2"] or [],
  "opportunities": ["Opportunity 1", "Opportunity 2"] or []
}

Analysis Guidelines:
- sentiment: Overall assessment tone
- qualityScore: Report quality and depth (1-100)
- readabilityScore: Report clarity (1-100)
- Extract specific report information where available
- Use null for unavailable information

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }

  /**
   * General document content analysis prompt - flexible analysis
   */
  private static getGeneralContentPrompt(): string {
    return `Analyze this document intelligently based on its actual content and purpose.

CRITICAL: You MUST return a valid JSON object with all required fields. No additional text or explanations.

Required JSON structure with all fields:
{
  "summary": "Executive summary capturing the document's main purpose and content",
  "keyPoints": ["Most important point 1", "Most important point 2", "Most important point 3"],
  "actionItems": ["Action item 1", "Action item 2"] or [],
  "questions": ["Question needing clarification 1", "Question 2"] or [],
  "suggestions": ["Relevant suggestion 1", "Suggestion 2", "Suggestion 3"],
  "sentiment": "positive" or "negative" or "neutral",
  "qualityScore": (1-100),
  "readabilityScore": (1-100)
}

Analysis Guidelines:
- Adapt your analysis to the document's actual purpose
- For technical docs: focus on completeness and accuracy
- For letters: focus on tone and clarity
- For forms: focus on completeness of information
- qualityScore: Document quality 1-100 based on its purpose
- readabilityScore: How easy the document is to read 1-100
- Provide meaningful content for each field based on the document

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }

  /**
   * Entity extraction template for DocumentEntities interface
   */
  private static getEntityExtractionTemplate(): string {
    return `Extract key entities from this document and return them in the DocumentEntities format.

CRITICAL: You MUST return a valid JSON object matching the DocumentEntities interface. No additional text or explanations.

Required JSON structure:
{
  "entities": [
    {
      "id": "unique-entity-id-1",
      "text": "Entity text as it appears in document",
      "type": "PERSON" | "ORGANIZATION" | "LOCATION" | "DATE" | "MONEY" | "EMAIL" | "PHONE" | "ADDRESS" | "CONTRACT_NUMBER" | "NAICS_CODE" | "CERTIFICATION" | "DEADLINE" | "REQUIREMENT" | "MISC",
      "confidence": 0.95,
      "startOffset": 150,
      "endOffset": 165,
      "context": "Surrounding text context for the entity",
      "metadata": {
        "source": "document-text",
        "extractedBy": "ai-analysis"
      }
    }
  ]
}

Entity Extraction Guidelines:
- Extract PERSON names (contractors, contacts, officials)
- Extract ORGANIZATION names (companies, agencies, departments)
- Extract LOCATION (addresses, cities, states, countries)
- Extract DATE (deadlines, dates, timelines)
- Extract MONEY (contract values, prices, costs)
- Extract EMAIL and PHONE contact information
- Extract CONTRACT_NUMBER and reference numbers
- Extract NAICS_CODE and classification codes
- Extract CERTIFICATION requirements
- Extract DEADLINE and submission dates
- Extract REQUIREMENT text for key requirements
- Use MISC for other important entities

Field Requirements:
- id: Generate unique identifier for each entity
- confidence: 0.0-1.0 confidence score
- startOffset/endOffset: Character positions in original text
- context: 20-50 characters of surrounding text
- metadata: Additional extraction information

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.`
  }
}
