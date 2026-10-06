import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

/**
 * Basic Processing Request Schema
 */
const BasicProcessingSchema = z.object({
  extractText: z.boolean().default(true)
    .describe("Extract text content from document"),
  
  parseStructure: z.boolean().default(true)
    .describe("Parse document structure (sections, tables, images)"),
  
  updateFields: z.object({
    name: z.string().optional()
      .describe("Update document name"),
    
    tags: z.array(z.string()).optional()
      .describe("Update document tags"),
    
    setAsideType: z.string().optional()
      .describe("Update set-aside type (8(a), HUBZone, etc.)"),
    
    naicsCodes: z.array(z.string()).optional()
      .describe("Update NAICS codes"),
    
    description: z.string().optional()
      .describe("Update document description"),
    
    documentType: z.string().optional()
      .describe("Update document type")
  }).optional().describe("Fields to update during processing"),
  
  options: z.object({
    priority: z.enum(['low', 'normal', 'high']).default('normal')
      .describe("Processing priority"),
    
    timeout: z.number().min(10).max(300).default(60)
      .describe("Processing timeout in seconds"),
    
    overwrite: z.boolean().default(false)
      .describe("Overwrite existing extracted content")
  }).optional().describe("Processing options")
})

/**
 * @swagger
 * /api/v1/documents/{id}/process/basic:
 *   post:
 *     summary: Basic document processing
 *     description: |
 *       Performs basic document processing including text extraction, structure parsing, 
 *       and field updates. This is fast, low-cost processing without heavy AI analysis.
 *       
 *       **Includes:**
 *       - Text extraction (extractedText)
 *       - Document structure (sections, tables, images)
 *       - User field updates (tags, setAsideType, naicsCodes)
 *       - Basic metadata updates
 *       
 *       **Processing Time:** ~2-5 seconds
 *       **Cost:** Low (minimal AI usage)
 *     tags:
 *       - Document Processing
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to process
 *         example: "doc_123abc"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               extractText:
 *                 type: boolean
 *                 default: true
 *                 description: Extract text content from document
 *               parseStructure:
 *                 type: boolean
 *                 default: true
 *                 description: Parse document structure (sections, tables, images)
 *               updateFields:
 *                 type: object
 *                 description: Fields to update during processing
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "Updated Contract.pdf"
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["contract", "reviewed"]
 *                   setAsideType:
 *                     type: string
 *                     example: "8(a)"
 *                   naicsCodes:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["541511", "541512"]
 *                   description:
 *                     type: string
 *                     example: "Government contract for IT services"
 *                   documentType:
 *                     type: string
 *                     example: "CONTRACT"
 *               options:
 *                 type: object
 *                 description: Processing options
 *                 properties:
 *                   priority:
 *                     type: string
 *                     enum: [low, normal, high]
 *                     default: normal
 *                   timeout:
 *                     type: number
 *                     minimum: 10
 *                     maximum: 300
 *                     default: 60
 *                     description: Processing timeout in seconds
 *                   overwrite:
 *                     type: boolean
 *                     default: false
 *                     description: Overwrite existing extracted content
 *           example:
 *             extractText: true
 *             parseStructure: true
 *             updateFields:
 *               tags: ["contract", "important"]
 *               setAsideType: "8(a)"
 *               naicsCodes: ["541511"]
 *               description: "Updated government contract"
 *             options:
 *               priority: "normal"
 *               timeout: 60
 *     responses:
 *       200:
 *         description: Basic processing completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 processing:
 *                   type: object
 *                   properties:
 *                     level:
 *                       type: string
 *                       example: "basic"
 *                     completed:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["text_extraction", "structure_parsing", "field_updates"]
 *                     duration:
 *                       type: string
 *                       example: "2.3s"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 document:
 *                   type: object
 *                   description: Updated document with basic processing results
 *       400:
 *         description: Bad request - invalid processing options
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document already being processed
 *       500:
 *         description: Internal server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const permissionError = await guardDocumentMutation((await params).id, 'WRITE');
  if (permissionError) return permissionError;

  const startTime = Date.now()
  
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
    const body = await request.json().catch(() => ({}))
    const validation = BasicProcessingSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data', 
          details: validation.error.format() 
        },
        { status: 400 }
      )
    }

    const { extractText, parseStructure, updateFields, options } = validation.data

    console.log('🔧 Basic Processing Request:', {
      documentId,
      extractText,
      parseStructure,
      hasFieldUpdates: !!updateFields,
      options
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
        name: true,
        status: true,
        filePath: true,
        mimeType: true,
        extractedText: true,
        content: true,
        processing: true,
        tags: true,
        setAsideType: true,
        naicsCodes: true,
        description: true,
        documentType: true
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if document has a file attached
    if (!document.filePath) {
      return NextResponse.json(
        { error: 'Document has no file attached. Please upload a file first.' },
        { status: 400 }
      )
    }

    // Check if already processing (unless overwrite is enabled)
    if (document.status === 'PROCESSING' && !options?.overwrite) {
      return NextResponse.json(
        { error: 'Document is already being processed' },
        { status: 409 }
      )
    }

    // Track completed operations
    const completedOperations: string[] = []
    const processingEvents: any[] = []

    // Update processing status
    const currentProcessing = (document.processing as any) || { 
      currentStatus: 'PENDING', 
      progress: 0, 
      events: [] 
    }

    currentProcessing.currentStatus = 'PROCESSING'
    currentProcessing.progress = 10
    currentProcessing.events = [
      ...currentProcessing.events,
      {
        id: `evt_${Date.now()}_basic_start`,
        eventType: 'STARTED',
        status: 'PROCESSING',
        message: 'Basic processing started',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { level: 'basic', options }
      }
    ]

    await prisma.document.update({
      where: { id: documentId },
      data: { 
        status: 'PROCESSING',
        processing: currentProcessing,
        updatedAt: new Date()
      }
    })

    // 1. Text Extraction
    let extractedText = document.extractedText
    if (extractText && (!extractedText || options?.overwrite)) {
      console.log('📄 Starting text extraction...')
      
      try {
        // Import document processor for text extraction
        const { documentProcessor } = await import("@/lib/ai/document-processor")
        
        // Extract text only (basic operation)
        const extractionResult = await documentProcessor.extractTextOnly(documentId)
        
        if (extractionResult.success && extractionResult.extractedText) {
          extractedText = extractionResult.extractedText
          completedOperations.push('text_extraction')
          currentProcessing.progress = 40
          
          console.log('✅ Text extraction completed:', extractedText.length, 'characters')
        } else {
          console.warn('⚠️ Text extraction failed:', extractionResult.error)
        }
      } catch (extractionError) {
        console.error('❌ Text extraction error:', extractionError)
        // Continue processing even if text extraction fails
      }
    } else if (extractedText) {
      completedOperations.push('text_extraction')
      currentProcessing.progress = 40
    }

    // 2. Structure Parsing
    let documentContent = (document.content as any) || { sections: [], tables: [], images: [] }
    if (parseStructure && (!documentContent.sections?.length || options?.overwrite)) {
      console.log('📋 Starting structure parsing...')
      
      try {
        // Import document processor for structure parsing
        const { documentProcessor } = await import("@/lib/ai/document-processor")
        
        // Parse document structure (basic operation)
        const structureResult = await documentProcessor.parseStructureOnly(documentId)
        
        if (structureResult.success && structureResult.structure) {
          documentContent = {
            sections: structureResult.structure.sections || [],
            tables: structureResult.structure.tables || [],
            images: structureResult.structure.images || []
          }
          completedOperations.push('structure_parsing')
          currentProcessing.progress = 70
          
          console.log('✅ Structure parsing completed:', {
            sections: documentContent.sections.length,
            tables: documentContent.tables.length,
            images: documentContent.images.length
          })
        } else {
          console.warn('⚠️ Structure parsing failed:', structureResult.error)
        }
      } catch (structureError) {
        console.error('❌ Structure parsing error:', structureError)
        // Continue processing even if structure parsing fails
      }
    } else if (documentContent.sections?.length) {
      completedOperations.push('structure_parsing')
      currentProcessing.progress = 70
    }

    // 3. Field Updates
    const documentUpdates: any = {}
    if (updateFields) {
      console.log('📝 Updating document fields...')
      
      if (updateFields.name !== undefined) documentUpdates.name = updateFields.name
      if (updateFields.tags !== undefined) documentUpdates.tags = updateFields.tags
      if (updateFields.setAsideType !== undefined) documentUpdates.setAsideType = updateFields.setAsideType
      if (updateFields.naicsCodes !== undefined) documentUpdates.naicsCodes = updateFields.naicsCodes
      if (updateFields.description !== undefined) documentUpdates.description = updateFields.description
      if (updateFields.documentType !== undefined) documentUpdates.documentType = updateFields.documentType
      
      completedOperations.push('field_updates')
      currentProcessing.progress = 90
      
      console.log('✅ Field updates prepared:', Object.keys(documentUpdates))
    }

    // 4. Complete Processing
    currentProcessing.currentStatus = 'COMPLETED'
    currentProcessing.progress = 100
    currentProcessing.events.push({
      id: `evt_${Date.now()}_basic_complete`,
      eventType: 'COMPLETED',
      status: 'COMPLETED',
      message: `Basic processing completed: ${completedOperations.join(', ')}`,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: { 
        level: 'basic', 
        operations: completedOperations,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      }
    })

    // Update document with all changes
    const finalUpdatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        ...documentUpdates,
        extractedText,
        content: documentContent,
        processing: currentProcessing,
        status: 'COMPLETED',
        processedAt: new Date(),
        updatedAt: new Date()
      },
      include: {
        folder: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    })

    const processingDuration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`

    console.log('✅ Basic processing completed successfully:', {
      documentId,
      operations: completedOperations,
      duration: processingDuration
    })

    // Format response
    const responseDocument = {
      id: finalUpdatedDocument.id,
      name: finalUpdatedDocument.name,
      extractedText: finalUpdatedDocument.extractedText,
      content: documentContent,
      tags: finalUpdatedDocument.tags || [],
      setAsideType: finalUpdatedDocument.setAsideType,
      naicsCodes: finalUpdatedDocument.naicsCodes || [],
      description: finalUpdatedDocument.description,
      documentType: finalUpdatedDocument.documentType,
      status: finalUpdatedDocument.status,
      processedAt: finalUpdatedDocument.processedAt?.toISOString(),
      folder: finalUpdatedDocument.folder,
      uploadedBy: finalUpdatedDocument.uploadedBy,
      opportunity: finalUpdatedDocument.opportunity
    }

    return NextResponse.json({
      success: true,
      processing: {
        level: 'basic',
        completed: completedOperations,
        duration: processingDuration,
        timestamp: new Date().toISOString(),
        operations: {
          textExtraction: completedOperations.includes('text_extraction'),
          structureParsing: completedOperations.includes('structure_parsing'),
          fieldUpdates: completedOperations.includes('field_updates')
        }
      },
      document: responseDocument
    })

  } catch (error) {
    console.error('❌ Basic processing error:', error)
    
    // Update document status to failed
    try {
      const currentProcessing = { 
        currentStatus: 'FAILED', 
        progress: 0, 
        events: [{
          id: `evt_${Date.now()}_basic_failed`,
          eventType: 'FAILED',
          status: 'FAILED',
          message: error instanceof Error ? error.message : 'Basic processing failed',
          timestamp: new Date().toISOString(),
          success: false
        }]
      }

      await prisma.document.update({
        where: { id: documentId },
        data: { 
          status: 'FAILED',
          processing: currentProcessing,
          processingError: error instanceof Error ? error.message : 'Basic processing failed',
          updatedAt: new Date()
        }
      })
    } catch (updateError) {
      console.error('❌ Failed to update document status:', updateError)
    }
    
    return NextResponse.json(
      { 
        error: 'Basic processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}