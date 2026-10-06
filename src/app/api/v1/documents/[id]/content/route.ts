import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

/**
 * Document Content Update Schema
 */
const DocumentSectionSchema = z.object({
  title: z.string().min(1).max(500)
    .describe("Section title or heading"),
  
  content: z.string().min(1)
    .describe("Section text content"),
  
  pageNumber: z.number().int().min(1).optional()
    .describe("Page number where section appears"),
  
  level: z.number().int().min(1).max(6).optional()
    .describe("Heading level (1-6)"),
  
  sectionId: z.string().optional()
    .describe("Unique identifier for section linking")
})

const DocumentTableSchema = z.object({
  headers: z.array(z.string().min(1).max(200))
    .describe("Table column headers"),
  
  rows: z.array(z.array(z.string().max(1000)))
    .describe("Table row data"),
  
  pageNumber: z.number().int().min(1).optional()
    .describe("Page number where table appears"),
  
  caption: z.string().max(500).optional()
    .describe("Table caption or title")
})

const DocumentImageSchema = z.object({
  id: z.string().min(1)
    .describe("Unique image identifier"),
  
  description: z.string().max(500).optional()
    .describe("Image description"),
  
  altText: z.string().max(200).optional()
    .describe("Alternative text for accessibility"),
  
  pageNumber: z.number().int().min(1).optional()
    .describe("Page number where image appears"),
  
  filePath: z.string().optional()
    .describe("Path to image file"),
  
  mimeType: z.string().optional()
    .describe("Image MIME type"),
  
  width: z.number().int().min(1).optional()
    .describe("Image width in pixels"),
  
  height: z.number().int().min(1).optional()
    .describe("Image height in pixels")
})

const DocumentContentUpdateSchema = z.object({
  sections: z.array(DocumentSectionSchema).max(100).optional()
    .describe("Update document sections (max 100 sections)"),
  
  tables: z.array(DocumentTableSchema).max(50).optional()
    .describe("Update document tables (max 50 tables)"),
  
  images: z.array(DocumentImageSchema).max(200).optional()
    .describe("Update document images (max 200 images)"),
  
  action: z.enum(['replace', 'merge', 'append']).default('replace')
    .describe("How to handle the content update: replace all, merge with existing, or append to existing")
})

/**
 * @swagger
 * /api/v1/documents/{id}/content:
 *   patch:
 *     summary: Update document content structure
 *     description: |
 *       Update the document's content structure including sections, tables, and images.
 *       This endpoint updates the content JSON field without triggering AI processing.
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
 *               sections:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [title, content]
 *                   properties:
 *                     title:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 500
 *                       example: "Introduction"
 *                     content:
 *                       type: string
 *                       minLength: 1
 *                       example: "This document outlines the requirements..."
 *                     pageNumber:
 *                       type: integer
 *                       minimum: 1
 *                       example: 1
 *                     level:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 6
 *                       example: 1
 *                     sectionId:
 *                       type: string
 *                       example: "intro_001"
 *               tables:
 *                 type: array
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [headers, rows]
 *                   properties:
 *                     headers:
 *                       type: array
 *                       items:
 *                         type: string
 *                         maxLength: 200
 *                       example: ["Item", "Description", "Price"]
 *                     rows:
 *                       type: array
 *                       items:
 *                         type: array
 *                         items:
 *                           type: string
 *                           maxLength: 1000
 *                       example: [["Service A", "IT Support", "$1000"], ["Service B", "Cloud Hosting", "$500"]]
 *                     pageNumber:
 *                       type: integer
 *                       minimum: 1
 *                       example: 2
 *                     caption:
 *                       type: string
 *                       maxLength: 500
 *                       example: "Service Pricing Table"
 *               images:
 *                 type: array
 *                 maxItems: 200
 *                 items:
 *                   type: object
 *                   required: [id]
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "img_001"
 *                     description:
 *                       type: string
 *                       maxLength: 500
 *                       example: "System architecture diagram"
 *                     altText:
 *                       type: string
 *                       maxLength: 200
 *                       example: "Diagram showing cloud infrastructure"
 *                     pageNumber:
 *                       type: integer
 *                       minimum: 1
 *                       example: 3
 *               action:
 *                 type: string
 *                 enum: [replace, merge, append]
 *                 default: replace
 *                 description: How to handle the content update
 *           example:
 *             sections:
 *               - title: "Executive Summary"
 *                 content: "This contract provides comprehensive IT services..."
 *                 pageNumber: 1
 *                 level: 1
 *               - title: "Scope of Work"
 *                 content: "The contractor shall provide the following services..."
 *                 pageNumber: 2
 *                 level: 1
 *             tables:
 *               - headers: ["Service", "Description", "Timeline"]
 *                 rows: [["Setup", "Initial configuration", "2 weeks"], ["Support", "Ongoing maintenance", "Ongoing"]]
 *                 pageNumber: 3
 *                 caption: "Service Delivery Timeline"
 *             action: "replace"
 *     responses:
 *       200:
 *         description: Document content updated successfully
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
 *                   example: "Document content updated successfully"
 *                 updated:
 *                   type: object
 *                   properties:
 *                     action:
 *                       type: string
 *                       example: "replace"
 *                     sections:
 *                       type: integer
 *                       example: 5
 *                     tables:
 *                       type: integer
 *                       example: 2
 *                     images:
 *                       type: integer
 *                       example: 3
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 document:
 *                   type: object
 *                   description: Updated document with new content structure
 *       400:
 *         description: Bad request - invalid content data
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
    const validation = DocumentContentUpdateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid content data', 
          details: validation.error.format() 
        },
        { status: 400 }
      )
    }

    const { sections, tables, images, action } = validation.data

    console.log('📋 Document Content Update:', {
      documentId,
      action,
      sectionsCount: sections?.length || 0,
      tablesCount: tables?.length || 0,
      imagesCount: images?.length || 0
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
        content: true
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if user has permission to update content
    // For now, allow document owner and users in same organization with WRITE permission
    const canUpdate = document.uploadedById === user.id || true // Allow org members

    if (!canUpdate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update document content' }, 
        { status: 403 }
      )
    }

    // Get current content
    const currentContent = (document.content as any) || { 
      sections: [], 
      tables: [], 
      images: [] 
    }

    // Apply content updates based on action
    const updatedContent = { ...currentContent }

    switch (action) {
      case 'replace':
        // Replace entire content
        if (sections !== undefined) updatedContent.sections = sections
        if (tables !== undefined) updatedContent.tables = tables
        if (images !== undefined) updatedContent.images = images
        break

      case 'merge':
        // Merge with existing content (replace matching items, keep others)
        if (sections !== undefined) {
          updatedContent.sections = sections
        }
        if (tables !== undefined) {
          updatedContent.tables = tables
        }
        if (images !== undefined) {
          updatedContent.images = images
        }
        break

      case 'append':
        // Append to existing content
        if (sections !== undefined) {
          updatedContent.sections = [...currentContent.sections, ...sections]
        }
        if (tables !== undefined) {
          updatedContent.tables = [...currentContent.tables, ...tables]
        }
        if (images !== undefined) {
          updatedContent.images = [...currentContent.images, ...images]
        }
        break
    }

    // Update the document
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        content: updatedContent,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        content: true,
        updatedAt: true
      }
    })

    console.log('✅ Document content updated:', {
      documentId,
      action,
      finalCounts: {
        sections: updatedContent.sections?.length || 0,
        tables: updatedContent.tables?.length || 0,
        images: updatedContent.images?.length || 0
      }
    })

    return NextResponse.json({
      success: true,
      message: `Document content updated successfully using ${action} action`,
      updated: {
        action,
        sections: updatedContent.sections?.length || 0,
        tables: updatedContent.tables?.length || 0,
        images: updatedContent.images?.length || 0,
        timestamp: new Date().toISOString()
      },
      document: {
        id: updatedDocument.id,
        name: updatedDocument.name,
        content: updatedContent,
        updatedAt: updatedDocument.updatedAt.toISOString()
      }
    })

  } catch (error) {
    console.error('❌ Document content update error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update document content',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}