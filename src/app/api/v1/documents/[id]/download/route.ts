import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFileWithFallback } from '@/lib/storage/path-utils'

/**
 * @swagger
 * /api/v1/documents/{id}/download:
 *   get:
 *     summary: Download a document file
 *     description: Downloads the actual file content for a document. Returns demo content if Supabase is not configured.
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to download
 *     responses:
 *       200:
 *         description: File content successfully downloaded
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *           text/plain:
 *             schema:
 *               type: string
 *         headers:
 *           Content-Type:
 *             description: MIME type of the file
 *             schema:
 *               type: string
 *           Content-Length:
 *             description: Size of the file in bytes
 *             schema:
 *               type: integer
 *           Content-Disposition:
 *             description: File disposition header
 *             schema:
 *               type: string
 *               example: 'inline; filename="document.pdf"'
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user doesn't have access to this document
 *       404:
 *         description: Document not found or file path missing
 *       500:
 *         description: Internal server error or file download failed
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentStep = 'initialization'
  try {
    console.log('🔍 Document download request started')

    currentStep = 'parameter_resolution'
    const resolvedParams = await params
    const documentId = resolvedParams.id

    currentStep = 'authentication'
    const { userId } = await auth()

    if (!userId) {
      console.log('❌ Download request unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!documentId) {
      console.log('❌ Document ID missing from params')
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      )
    }

    console.log('📄 Download request for document:', documentId)

    currentStep = 'user_lookup'
    // Get user info
    let user = null

    if (userId !== 'test-user-id') {
      user = await prisma.user.findUnique({
        where: { clerkId: userId, deletedAt: null },
        select: { id: true, organizationId: true },
      })
    } else {
      // TEMPORARY: Mock user for testing - REMOVE IN PRODUCTION
      console.log('⚠️ USING MOCK USER FOR TESTING - REMOVE IN PRODUCTION')
      user = {
        id: 'test-user-db-id',
        organizationId: 'cmdm7dvvy0002s820wq4kz532',
      }
    }

    if (!user) {
      console.log('❌ User not found for clerkId:', userId)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('✅ User found:', {
      userId: user.id,
      organizationId: user.organizationId,
    })

    currentStep = 'document_lookup'
    // Get document and verify access
    let document = null
    try {
      document = await prisma.document.findUnique({
        where: { id: documentId, deletedAt: null },
        select: {
          id: true,
          organizationId: true,
          filePath: true,
          name: true,
          mimeType: true,
          size: true,
          extractedText: true, // For created documents, this contains the content
          content: true, // Document content field (JSON)
        },
      })
    } catch (dbError) {
      console.error('❌ Database query failed:', dbError)
      return NextResponse.json(
        {
          error: 'Database connection error',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 500 }
      )
    }

    console.log('📋 Document query result:', {
      found: !!document,
      documentId,
      hasFilePath: !!document?.filePath,
      hasExtractedText: !!document?.extractedText,
      organizationId: document?.organizationId,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    console.log('📁 Document details:', {
      filePath: document.filePath,
      name: document.name,
      mimeType: document.mimeType,
      hasExtractedText: !!document.extractedText,
      isVirtualPath: document.filePath?.startsWith('/documents/'),
      fileExtension: document.name?.split('.').pop(),
      hasValidExtension: document.name?.includes('.'),
      filePathParts: document.filePath?.split('/'),
    })

    currentStep = 'content_determination'
    // Check if this is a created document (virtual path) vs uploaded document (real file)
    const isCreatedDocument =
      document.filePath?.startsWith('/documents/') ||
      !document.filePath?.includes('.')

    console.log('🔍 Document type analysis:', {
      filePath: document.filePath,
      isCreatedDocument,
      hasExtractedText: !!document.extractedText,
      hasContent: !!document.content,
      contentType: typeof document.content,
      extractedTextLength: document.extractedText?.length || 0,
      mimeType: document.mimeType,
    })

    if (isCreatedDocument) {
      console.log('📝 This is a created document, returning content directly')

      currentStep = 'content_extraction'
      // For created documents, return the content directly
      let content = ''

      if (document.extractedText) {
        content = document.extractedText
        console.log('✅ Using extractedText field')
      } else if (document.content && typeof document.content === 'object') {
        // Try to extract content from content field
        const contentData = document.content as any
        content =
          contentData?.extractedText ||
          contentData?.text ||
          contentData?.summary ||
          'No content available'
        console.log('✅ Using content field')
      } else {
        content = 'No content available for this document'
        console.log('⚠️ No content found in document')
      }

      // Return as text content
      const textContent = new TextEncoder().encode(content)
      return new Response(textContent, {
        headers: {
          'Content-Type': document.mimeType || 'text/plain',
          'Content-Length': textContent.byteLength.toString(),
          'Content-Disposition': `inline; filename="${document.name}"`,
          'Cache-Control': 'private, no-store',
          'X-Document-Type': 'created',
        },
      })
    }

    currentStep = 'supabase_setup'
    // Handle uploaded documents from Supabase Storage
    console.log('📄 This is an uploaded document, fetching from storage')
    console.log(
      '🔧 Supabase admin client status:',
      supabaseAdmin ? 'available' : 'not configured'
    )

    if (!supabaseAdmin) {
      // If Supabase is not configured, create a demo/placeholder response
      console.warn(
        '⚠️  Supabase not configured - creating demo file response for:',
        document.name
      )

      // Create a simple demo file content based on file type
      let demoContent: ArrayBuffer
      let contentType = document.mimeType || 'application/octet-stream'

      if (document.mimeType?.startsWith('image/')) {
        // For images, return a simple SVG placeholder
        const svgContent = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#f0f0f0" stroke="#ccc"/>
          <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">
            Demo Image: ${document.name}
          </text>
          <text x="200" y="180" text-anchor="middle" font-family="Arial" font-size="12" fill="#999">
            Supabase storage not configured
          </text>
        </svg>`
        demoContent = new TextEncoder().encode(svgContent)
        contentType = 'image/svg+xml'
      } else if (
        document.mimeType?.startsWith('text/') ||
        document.mimeType?.includes('json')
      ) {
        // For text files, return demo content
        const textContent = `Demo file: ${document.name}\n\nThis is a demo file because Supabase storage is not configured.\nTo enable real file storage, please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.`
        demoContent = new TextEncoder().encode(textContent)
      } else {
        // For other files, return a simple text representation
        const textContent = `Demo file: ${document.name}\n\nFile type: ${document.mimeType}\nFile size: ${document.size} bytes\n\nThis is a demo response because Supabase storage is not configured.`
        demoContent = new TextEncoder().encode(textContent)
        contentType = 'text/plain'
      }

      // Return demo file
      return new Response(demoContent, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': demoContent.byteLength.toString(),
          'Content-Disposition': `inline; filename="${document.name}"`,
          'Cache-Control': 'private, no-store', // Cache for 5 minutes
          'X-Demo-File': 'true', // Indicate this is a demo file
        },
      })
    }

    // Check if filePath exists
    if (!document.filePath) {
      console.error('Document filePath is missing for document:', documentId)
      return NextResponse.json(
        { error: 'File path not found for document' },
        { status: 404 }
      )
    }

    currentStep = 'supabase_download'
    // Download from Supabase Storage with fallback to alternative paths
    console.log(
      '⬇️  Attempting download from Supabase storage:',
      document.filePath
    )
    
    let fileData = null
    let actualPath = document.filePath
    let downloadError = null
    
    try {
      const result = await downloadFileWithFallback(document.filePath, document.organizationId)
      fileData = result.data
      actualPath = result.actualPath
      downloadError = result.error
      
      if (actualPath !== document.filePath) {
        console.log(`📁 File found at alternative path: ${actualPath} (original: ${document.filePath})`)
      }
    } catch (supabaseError) {
      console.error('❌ Supabase storage download threw exception:', supabaseError)
      return NextResponse.json(
        {
          error: 'Storage system error',
          details: supabaseError instanceof Error ? supabaseError.message : 'Unknown storage error',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 500 }
      )
    }

    if (downloadError || !fileData) {
      console.error('❌ Supabase download failed at all attempted paths:', {
        originalPath: document.filePath,
        actualPath,
        error: downloadError
      })
      return NextResponse.json(
        {
          error: 'Failed to download file',
          details: downloadError?.message || 'File not found at any expected path',
          originalPath: document.filePath,
          attemptedPath: actualPath
        },
        { status: 404 }
      )
    }

    console.log('✅ File downloaded successfully from Supabase')

    currentStep = 'file_processing'
    
    // Validate file data before processing
    if (fileData.size === 0) {
      console.error('❌ Downloaded file is empty')
      return NextResponse.json(
        {
          error: 'Downloaded file is empty',
          details: 'File exists but contains no data',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 422 }
      )
    }

    // Convert to array buffer
    let arrayBuffer
    try {
      arrayBuffer = await fileData.arrayBuffer()
      
      // Validate array buffer
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Array buffer is empty or null')
      }
      
      console.log('✅ File processing successful:', {
        originalSize: fileData.size,
        bufferSize: arrayBuffer.byteLength,
        documentId,
        fileName: document.name
      })
      
    } catch (bufferError) {
      console.error('❌ Failed to convert file to array buffer:', bufferError)
      return NextResponse.json(
        {
          error: 'File processing error',
          details: bufferError instanceof Error ? bufferError.message : 'Unknown buffer conversion error',
          timestamp: new Date().toISOString(),
          failedStep: currentStep,
        },
        { status: 500 }
      )
    }

    // Return file with appropriate headers
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Length': document.size?.toString() || '',
        'Content-Disposition': `inline; filename="${document.name}"`,
        'Cache-Control': 'private, no-store', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('🚨 Document download error:', error)
    console.error(
      '📋 Error stack:',
      error instanceof Error ? error.stack : 'No stack trace'
    )
    console.error('🎯 Failed at step:', currentStep)

    // Provide more detailed error information for debugging
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown error type',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      failedStep: currentStep,
    }

    console.error(
      '🔍 Detailed error info:',
      JSON.stringify(errorDetails, null, 2)
    )

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errorDetails.message,
        timestamp: errorDetails.timestamp,
        failedStep: currentStep,
      },
      { status: 500 }
    )
  }
}
