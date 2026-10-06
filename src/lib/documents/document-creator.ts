import {
  DocumentCreationRequest,
  DocumentType,
  type DocumentCreationRequestType
} from '@/types/document-processing'
import {
  Document,
} from '@/types/documents'
import { randomUUID as uuidv4 } from 'node:crypto'

export interface DocumentTemplate {
  id: string
  name: string
  description: string
  type: string
  content: string
  metadata: {
    tags: string[]
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical'
    complexityScore: number
  }
}

export interface DocumentCreationOptions {
  templateId?: string
  autoSave?: boolean
  generateInitialContent?: boolean
  aiProvider?: string
}

export class DocumentCreatorService {
  private static instance: DocumentCreatorService

  private constructor() {}

  public static getInstance(): DocumentCreatorService {
    if (!DocumentCreatorService.instance) {
      DocumentCreatorService.instance = new DocumentCreatorService()
    }
    return DocumentCreatorService.instance
  }

  /**
   * Create a new document from scratch or template
   */
  public async createDocument(
    request: DocumentCreationRequestType,
    options: DocumentCreationOptions = {}
  ): Promise<Document> {
    try {
      const documentId = uuidv4()
      const now = new Date()
      const nowIso = now.toISOString()

      // Get template content if specified
      let initialContent = request.content || ''
      if (options.templateId) {
        const template = await this.getTemplate(options.templateId)
        if (template) {
          initialContent = template.content
        }
      }

      // Generate initial content using AI if requested
      if (options.generateInitialContent && !initialContent) {
        initialContent = await this.generateInitialContent(request.type.toLowerCase(), request.name)
      }

      const sections = this.extractSections(initialContent).map((section, index) => ({
        ...section, id: uuidv4(), sectionOrder: index, sectionType: 'text', parentId: null, level: 1,
      }));
      const document: Document = {
        id: documentId, name: request.name, folderId: null,
        organizationId: request.organizationId, uploadedById: request.createdBy,
        type: 'md', mimeType: 'text/markdown', size: new TextEncoder().encode(initialContent).length,
        filePath: `/documents/${documentId}`, uploadDate: nowIso, lastModified: nowIso,
        createdAt: nowIso, updatedAt: nowIso, deletedAt: null,
        updatedBy: request.createdBy, isEditable: true, tags: request.tags ?? [],
        documentType: request.type, securityClassification: 'INTERNAL', workflowStatus: 'DRAFT',
        description: null, extractedText: initialContent, summary: this.generateBasicSummary(initialContent),
        content: { sections, tables: [], images: [], keyPoints: this.extractKeyPoints(initialContent) },
        entities: { entities: [] }, sharing: { permissions: [], share: null, shareViews: [], comments: [] },
        revisions: { revisions: [] }, analysis: { contract: null, compliance: null },
        embeddings: { documentId, documentTitle: request.name, organizationNamespace: request.organizationId, chunks: [], model: '', dimensions: 0, totalChunks: 0, lastProcessed: '' },
        processing: {
          currentStatus: 'COMPLETED', progress: 100, currentStep: null, estimatedCompletion: null,
          events: [{ id: uuidv4(), userId: request.createdBy, event: 'Document created', eventType: 'COMPLETED', success: true, error: null, timestamp: nowIso, duration: 0, metadata: null }],
        },
      };

      return document

    } catch (error) {
      console.error('Document creation failed:', error)
      throw new Error(`Document creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get available document templates
   */
  public async getAvailableTemplates(): Promise<DocumentTemplate[]> {
    // In a real implementation, this would fetch from database
    return [
      {
        id: 'gov-proposal-template',
        name: 'Government Proposal Template',
        description: 'Standard template for government contract proposals',
        type: 'proposal',
        content: this.getGovernmentProposalTemplate(),
        metadata: {
          tags: ['government', 'proposal', 'template'],
          urgencyLevel: 'high',
          complexityScore: 8
        }
      },
      {
        id: 'compliance-doc-template',
        name: 'Compliance Documentation Template',
        description: 'Template for compliance and certification documents',
        type: 'compliance',
        content: this.getComplianceTemplate(),
        metadata: {
          tags: ['compliance', 'certification', 'template'],
          urgencyLevel: 'high',
          complexityScore: 7
        }
      },
      {
        id: 'technical-spec-template',
        name: 'Technical Specification Template',
        description: 'Template for technical documentation and specifications',
        type: 'technical',
        content: this.getTechnicalSpecTemplate(),
        metadata: {
          tags: ['technical', 'specification', 'template'],
          urgencyLevel: 'medium',
          complexityScore: 9
        }
      },
      {
        id: 'contract-review-template',
        name: 'Contract Review Template',
        description: 'Template for contract review and analysis documents',
        type: 'contract',
        content: this.getContractReviewTemplate(),
        metadata: {
          tags: ['contract', 'review', 'analysis', 'template'],
          urgencyLevel: 'high',
          complexityScore: 6
        }
      },
      {
        id: 'blank-document',
        name: 'Blank Document',
        description: 'Start with a blank document',
        type: 'other',
        content: '',
        metadata: {
          tags: [],
          urgencyLevel: 'medium',
          complexityScore: 1
        }
      }
    ]
  }

  /**
   * Get a specific template by ID
   */
  public async getTemplate(templateId: string): Promise<DocumentTemplate | null> {
    const templates = await this.getAvailableTemplates()
    return templates.find(t => t.id === templateId) || null
  }

  /**
   * Generate initial content using AI (placeholder implementation)
   */
  private async generateInitialContent(documentType: string, title: string): Promise<string> {
    // This would use the AI service to generate initial content
    // For now, return a basic structure based on document type
    switch (documentType) {
      case 'proposal':
        return `# ${title}\n\n## Executive Summary\n\n[Your executive summary here]\n\n## Technical Approach\n\n[Your technical approach here]\n\n## Project Timeline\n\n[Your project timeline here]\n\n## Budget\n\n[Your budget information here]`

      case 'compliance':
        return `# ${title}\n\n## Compliance Overview\n\n[Compliance overview here]\n\n## Requirements\n\n[List of requirements here]\n\n## Certification\n\n[Certification details here]`

      case 'contract':
        return `# ${title}\n\n## Contract Overview\n\n[Contract overview here]\n\n## Terms and Conditions\n\n[Terms and conditions here]\n\n## Deliverables\n\n[Deliverables here]`

      default:
        return `# ${title}\n\n[Document content here]`
    }
  }

  /**
   * Get file extension for document type
   */
  private getFileExtensionForType(type: string): string {
    const extensions: Record<string, string> = {
      'proposal': 'md',
      'contract': 'md',
      'compliance': 'md',
      'certification': 'md',
      'technical': 'md',
      'template': 'md',
      'other': 'md'
    }
    return extensions[type] || 'md'
  }

  /**
   * Get MIME type for document type
   */
  private getMimeTypeForType(type: string): string {
    // All created documents are markdown for now
    return 'text/markdown'
  }

  /**
   * Calculate document size from content
   */
  private calculateSize(content: string): string {
    const bytes = new TextEncoder().encode(content).length
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Generate basic summary from content
   */
  private generateBasicSummary(content: string): string {
    const lines = content.split('\n').filter(line => line.trim())
    const firstParagraph = lines.find(line => line.length > 50)
    return firstParagraph ? firstParagraph.substring(0, 200) + '...' : 'New document created'
  }

  /**
   * Extract key points from content
   */
  private extractKeyPoints(content: string): string[] {
    const points = content.match(/^[-*]\s+(.+)$/gm) || []
    return points.slice(0, 5).map(point => point.replace(/^[-*]\s+/, ''))
  }

  /**
   * Extract sections from content
   */
  private extractSections(content: string) {
    const sections = []
    const lines = content.split('\n')
    let currentSection = { title: 'Introduction', content: '', pageNumber: 1 }

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (currentSection.content.trim()) {
          sections.push(currentSection)
        }
        currentSection = {
          title: line.replace(/^#+\s*/, ''),
          content: '',
          pageNumber: Math.floor(sections.length / 5) + 1
        }
      } else {
        currentSection.content += line + '\n'
      }
    }

    if (currentSection.content.trim()) {
      sections.push(currentSection)
    }

    return sections
  }

  /**
   * Government Proposal Template
   */
  private getGovernmentProposalTemplate(): string {
    return `# Government Contract Proposal

## Executive Summary
[Provide a brief overview of your proposal, highlighting key benefits and value proposition]

## Understanding of Requirements
[Demonstrate your understanding of the government's needs and requirements]

## Technical Approach
### Methodology
[Describe your technical approach and methodology]

### Solution Architecture
[Detail your proposed solution architecture]

### Quality Assurance
[Outline your quality assurance processes]

## Project Management
### Timeline
[Provide project timeline and milestones]

### Team Structure
[Detail your team structure and key personnel]

### Risk Management
[Identify risks and mitigation strategies]

## Past Performance
[Highlight relevant past performance and references]

## Budget and Pricing
[Provide detailed pricing structure]

## Compliance and Certifications
[List relevant certifications and compliance requirements]

## Appendices
[Additional supporting documentation]`
  }

  /**
   * Compliance Documentation Template
   */
  private getComplianceTemplate(): string {
    return `# Compliance Documentation

## Overview
[Brief overview of compliance requirements and scope]

## Regulatory Framework
[Identify applicable regulations and standards]

## Compliance Requirements
### Federal Acquisition Regulation (FAR)
- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

### Industry-Specific Requirements
- [ ] Requirement 1
- [ ] Requirement 2

## Certifications
### Required Certifications
- [ ] Certification 1
- [ ] Certification 2

### Current Status
[Status of current certifications]

## Compliance Procedures
[Detail compliance procedures and processes]

## Documentation and Records
[Specify required documentation and record-keeping]

## Monitoring and Reporting
[Describe monitoring and reporting requirements]

## Non-Compliance Remediation
[Outline procedures for addressing non-compliance]

## Review and Updates
[Schedule for review and updates of compliance documentation]`
  }

  /**
   * Technical Specification Template
   */
  private getTechnicalSpecTemplate(): string {
    return `# Technical Specification

## Introduction
[Brief introduction to the technical specification]

## System Overview
[High-level system overview and objectives]

## Functional Requirements
### Core Functionality
- Requirement 1: [Description]
- Requirement 2: [Description]
- Requirement 3: [Description]

### User Interface Requirements
- [UI Requirement 1]
- [UI Requirement 2]

## Non-Functional Requirements
### Performance Requirements
- [Performance requirement 1]
- [Performance requirement 2]

### Security Requirements
- [Security requirement 1]
- [Security requirement 2]

### Scalability Requirements
- [Scalability requirement 1]

## Technical Architecture
### System Architecture
[Describe system architecture]

### Technology Stack
[List technology stack components]

### Integration Points
[Detail integration requirements]

## Data Requirements
### Data Models
[Describe data models and structures]

### Data Flow
[Detail data flow through the system]

## Security Considerations
[Outline security considerations and requirements]

## Testing Strategy
[Describe testing approach and requirements]

## Deployment Requirements
[Detail deployment and infrastructure requirements]

## Maintenance and Support
[Outline maintenance and support requirements]

## Appendices
[Additional technical documentation]`
  }

  /**
   * Contract Review Template
   */
  private getContractReviewTemplate(): string {
    return `# Contract Review and Analysis

## Contract Information
- **Contract Title**: [Title]
- **Contract Number**: [Number]
- **Contracting Agency**: [Agency]
- **Contract Value**: [Value]
- **Contract Period**: [Period]

## Executive Summary
[Brief summary of contract and key findings]

## Contract Analysis
### Scope of Work
[Analysis of scope of work requirements]

### Performance Requirements
[Review of performance requirements and metrics]

### Deliverables
[Analysis of required deliverables and timelines]

### Payment Terms
[Review of payment terms and conditions]

## Risk Assessment
### Technical Risks
- [Risk 1]: [Description and mitigation]
- [Risk 2]: [Description and mitigation]

### Business Risks
- [Risk 1]: [Description and mitigation]
- [Risk 2]: [Description and mitigation]

### Compliance Risks
- [Risk 1]: [Description and mitigation]

## Opportunities
### Business Opportunities
- [Opportunity 1]: [Description]
- [Opportunity 2]: [Description]

### Growth Opportunities
- [Growth opportunity 1]
- [Growth opportunity 2]

## Recommendations
### Bid/No-Bid Recommendation
[Provide recommendation with justification]

### Strategic Considerations
[Outline strategic considerations]

### Resource Requirements
[Detail required resources and capabilities]

## Action Items
- [ ] Action item 1
- [ ] Action item 2
- [ ] Action item 3

## Next Steps
[Outline next steps in the decision process]

## Appendices
- Contract documents
- Supporting analysis
- Reference materials`
  }
}
