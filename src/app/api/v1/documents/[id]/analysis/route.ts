import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

/**
 * Document Analysis Update Schema
 */
const ContractAnalysisSchema = z.object({
  score: z.number().min(0).max(100)
    .describe("Overall contract quality score (0-100)"),
  
  contractType: z.enum(['SERVICE_AGREEMENT', 'PROCUREMENT', 'LEASE', 'EMPLOYMENT', 'OTHER'])
    .describe("Type of contract"),
  
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .describe("Contract risk assessment"),
  
  keyTerms: z.array(z.string().min(1).max(200)).max(50)
    .describe("Important contract terms identified"),
  
  estimatedValue: z.string().max(100).optional()
    .describe("Estimated contract value"),
  
  deadlines: z.array(z.string().max(200)).max(20)
    .describe("Important dates and deadlines"),
  
  parties: z.array(z.string().min(1).max(200)).max(10)
    .describe("Contract parties identified"),
  
  requirements: z.array(z.string().min(1).max(500)).max(50)
    .describe("Contract requirements"),
  
  risks: z.array(z.string().min(1).max(500)).max(30)
    .describe("Identified risks"),
  
  opportunities: z.array(z.string().min(1).max(500)).max(30)
    .describe("Identified opportunities")
})

const ComplianceCheckSchema = z.object({
  score: z.number().min(0).max(100)
    .describe("Compliance score percentage (0-100)"),
  
  status: z.enum(['COMPLIANT', 'NON_COMPLIANT', 'PARTIAL', 'UNKNOWN'])
    .describe("Compliance status"),
  
  checks: z.array(z.object({
    category: z.string().min(1).max(100)
      .describe("Compliance category"),
    
    passed: z.boolean()
      .describe("Whether check passed"),
    
    details: z.string().min(1).max(1000)
      .describe("Check details or requirements"),
    
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional()
      .describe("Issue severity if check failed")
  })).max(50).describe("Individual compliance checks"),
  
  recommendations: z.array(z.string().min(1).max(500)).max(30)
    .describe("Compliance recommendations"),
  
  lastCheckedAt: z.string().datetime()
    .describe("Last compliance check timestamp")
})

const SecurityAnalysisSchema = z.object({
  classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
    .describe("Security classification level"),
  
  piiDetected: z.boolean()
    .describe("Whether PII was detected"),
  
  piiTypes: z.array(z.string().min(1).max(100)).max(20)
    .describe("Types of PII detected"),
  
  securityRisks: z.array(z.string().min(1).max(500)).max(30)
    .describe("Identified security risks"),
  
  complianceIssues: z.array(z.string().min(1).max(500)).max(30)
    .describe("Security compliance issues"),
  
  recommendations: z.array(z.string().min(1).max(500)).max(30)
    .describe("Security recommendations"),
  
  confidenceScore: z.number().min(0).max(1)
    .describe("Analysis confidence score (0-1)")
})

const DocumentAnalysisUpdateSchema = z.object({
  contract: ContractAnalysisSchema.optional()
    .describe("Contract analysis results"),
  
  compliance: ComplianceCheckSchema.optional()
    .describe("Compliance check results"),
  
  security: SecurityAnalysisSchema.optional()
    .describe("Security analysis results"),
  
  action: z.enum(['replace', 'merge']).default('merge')
    .describe("How to handle the analysis update: replace all or merge with existing")
})

/**
 * @swagger
 * /api/v1/documents/{id}/analysis:
 *   patch:
 *     summary: Update document AI analysis results
 *     description: |
 *       Update the document's AI analysis results including contract analysis,
 *       compliance checks, and security analysis. This endpoint updates the
 *       analysis JSON field without triggering new AI processing.
 *     tags:
 *       - Document Updates
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to update
 *         example: "doc_123abc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contract:
 *                 type: object
 *                 description: Contract analysis results
 *                 properties:
 *                   score:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 100
 *                     example: 85
 *                   contractType:
 *                     type: string
 *                     enum: [SERVICE_AGREEMENT, PROCUREMENT, LEASE, EMPLOYMENT, OTHER]
 *                     example: "SERVICE_AGREEMENT"
 *                   riskLevel:
 *                     type: string
 *                     enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                     example: "MEDIUM"
 *                   keyTerms:
 *                     type: array
 *                     items:
 *                       type: string
 *                     maxItems: 50
 *                     example: ["payment terms", "delivery schedule", "warranty"]
 *                   estimatedValue:
 *                     type: string
 *                     example: "$500,000"
 *                   deadlines:
 *                     type: array
 *                     items:
 *                       type: string
 *                     maxItems: 20
 *                     example: ["2024-06-30", "2024-12-31"]
 *               compliance:
 *                 type: object
 *                 description: Compliance check results
 *                 properties:
 *                   score:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 100
 *                     example: 92
 *                   status:
 *                     type: string
 *                     enum: [COMPLIANT, NON_COMPLIANT, PARTIAL, UNKNOWN]
 *                     example: "COMPLIANT"
 *                   checks:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         category:
 *                           type: string
 *                           example: "SECURITY"
 *                         passed:
 *                           type: boolean
 *                           example: true
 *                         details:
 *                           type: string
 *                           example: "All security requirements met"
 *                   recommendations:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["Consider additional security measures"]
 *               security:
 *                 type: object
 *                 description: Security analysis results
 *                 properties:
 *                   classification:
 *                     type: string
 *                     enum: [PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED]
 *                     example: "INTERNAL"
 *                   piiDetected:
 *                     type: boolean
 *                     example: false
 *                   piiTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: []
 *                   confidenceScore:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 1
 *                     example: 0.95
 *               action:
 *                 type: string
 *                 enum: [replace, merge]
 *                 default: merge
 *                 description: How to handle the analysis update
 *           example:
 *             contract:
 *               score: 85
 *               contractType: "SERVICE_AGREEMENT"
 *               riskLevel: "MEDIUM"
 *               keyTerms: ["payment terms", "delivery schedule", "warranty"]
 *               estimatedValue: "$500,000"
 *               deadlines: ["2024-06-30", "2024-12-31"]
 *             compliance:
 *               score: 92
 *               status: "COMPLIANT"
 *               checks:
 *                 - category: "SECURITY"
 *                   passed: true
 *                   details: "All security requirements met"
 *               recommendations: []
 *             action: "merge"
 *     responses:
 *       200:
 *         description: Document analysis updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document analysis updated successfully"
 *                 updated:
 *                   type: object
 *                   properties:
 *                     action:
 *                       type: string
 *                       example: "merge"
 *                     sections:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["contract", "compliance"]
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 document:
 *                   type: object
 *                   description: Updated document with new analysis results
 *       400:
 *         description: Bad request - invalid analysis data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const permissionError = await guardDocumentMutation((await params).id, 'WRITE');
  if (permissionError) return permissionError;

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await params
    const documentId = resolvedParams.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = DocumentAnalysisUpdateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid analysis data', 
          details: validation.error.format() 
        },
        { status: 400 }
      )
    }

    const { contract, compliance, security, action } = validation.data

    console.log('🔍 Document Analysis Update:', {
      documentId,
      action,
      sections: {
        contract: !!contract,
        compliance: !!compliance,
        security: !!security
      }
    })

    // Get user info
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get document and verify access
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        uploadedById: true,
        analysis: true
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if user has permission to update analysis
    // For now, allow document owner and users in same organization
    const canUpdate = document.uploadedById === user.id || true // Allow org members

    if (!canUpdate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update document analysis' }, 
        { status: 403 }
      )
    }

    // Get current analysis
    const currentAnalysis = (document.analysis as any) || {}

    // Apply analysis updates based on action
    const updatedAnalysis = { ...currentAnalysis }
    const updatedSections: string[] = []

    if (action === 'replace') {
      // Replace entire analysis sections
      if (contract !== undefined) {
        updatedAnalysis.contract = contract
        updatedSections.push('contract')
      }
      if (compliance !== undefined) {
        updatedAnalysis.compliance = compliance
        updatedSections.push('compliance')
      }
      if (security !== undefined) {
        updatedAnalysis.security = security
        updatedSections.push('security')
      }
    } else if (action === 'merge') {
      // Merge with existing analysis
      if (contract !== undefined) {
        updatedAnalysis.contract = {
          ...currentAnalysis.contract,
          ...contract
        }
        updatedSections.push('contract')
      }
      if (compliance !== undefined) {
        updatedAnalysis.compliance = {
          ...currentAnalysis.compliance,
          ...compliance
        }
        updatedSections.push('compliance')
      }
      if (security !== undefined) {
        updatedAnalysis.security = {
          ...currentAnalysis.security,
          ...security
        }
        updatedSections.push('security')
      }
    }

    if (updatedSections.length === 0) {
      return NextResponse.json(
        { error: 'No analysis sections to update' },
        { status: 400 }
      )
    }

    // Update the document
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        analysis: updatedAnalysis,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        analysis: true,
        updatedAt: true
      }
    })

    console.log('✅ Document analysis updated:', {
      documentId,
      action,
      updatedSections,
      analysisKeys: Object.keys(updatedAnalysis)
    })

    return NextResponse.json({
      success: true,
      message: `Document analysis updated successfully using ${action} action`,
      updated: {
        action,
        sections: updatedSections,
        timestamp: new Date().toISOString()
      },
      document: {
        id: updatedDocument.id,
        name: updatedDocument.name,
        analysis: updatedAnalysis,
        updatedAt: updatedDocument.updatedAt.toISOString()
      }
    })

  } catch (error) {
    console.error('❌ Document analysis update error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update document analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}