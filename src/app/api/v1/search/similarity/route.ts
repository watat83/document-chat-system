/**
 * @swagger
 * /api/v1/search/similarity:
 *   post:
 *     summary: Semantic similarity search
 *     description: Search for similar document chunks using vector embeddings
 *     tags: [Search]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query text
 *               documentTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Filter by document types
 *               naicsCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Filter by NAICS codes
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Filter by tags
 *               topK:
 *                 type: number
 *                 description: Number of results to return (default 10)
 *               minScore:
 *                 type: number
 *                 description: Minimum similarity score (0-1, default 0.7)
 *               includeHighlights:
 *                 type: boolean
 *                 description: Include text highlights in results
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       documentId:
 *                         type: string
 *                       documentTitle:
 *                         type: string
 *                       chunkId:
 *                         type: string
 *                       chunkIndex:
 *                         type: number
 *                       chunkText:
 *                         type: string
 *                       score:
 *                         type: number
 *                       highlights:
 *                         type: array
 *                         items:
 *                           type: string
 *                 totalResults:
 *                   type: number
 *                 processingTimeMs:
 *                   type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { defaultVectorSearch } from '@/lib/ai/services/vector-search'

const SimilaritySearchSchema = z.object({
  query: z.string().min(1).describe('Search query text'),
  documentId: z.string().optional().describe('Filter to specific document ID'),
  documentTypes: z.array(z.string()).optional().describe('Document type filters'),
  naicsCodes: z.array(z.string()).optional().describe('NAICS code filters'),
  tags: z.array(z.string()).optional().describe('Tag filters'),
  topK: z.number().min(1).max(100).default(10).describe('Number of results'),
  minScore: z.number().min(0).max(1).default(0.3).describe('Minimum similarity score'),
  includeHighlights: z.boolean().default(true).describe('Include text highlights'),
})

export async function POST(request: NextRequest) {
  let body: any
  let validatedData: any
  let userId: string | null = null
  let user: any = null
  const startTime = Date.now()

  try {

    const authResult = await auth()
    userId = authResult?.userId || null
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate request
    body = await request.json()
    validatedData = SimilaritySearchSchema.parse(body)

    // Get user's organization
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Perform similarity search
    const results = await defaultVectorSearch.searchSimilar(
      validatedData.query,
      {
        organizationId: user.organizationId,
        documentId: validatedData.documentId, // Filter to specific document if provided
        documentTypes: validatedData.documentTypes,
        naicsCodes: validatedData.naicsCodes,
        tags: validatedData.tags
      },
      {
        topK: validatedData.topK,
        minScore: validatedData.minScore,
        includeMetadata: true,
        rerank: true // Enable reranking for better results
      }
    )

    // Remove sensitive metadata before sending to client
    const sanitizedResults = results.map(result => ({
      documentId: result.documentId,
      documentTitle: result.documentTitle,
      chunkId: result.chunkId,
      chunkIndex: result.chunkIndex,
      chunkText: result.chunkText,
      score: result.score,
      highlights: validatedData.includeHighlights ? result.highlights : undefined
    }))

    return NextResponse.json({
      success: true,
      results: sanitizedResults,
      totalResults: sanitizedResults.length,
      processingTimeMs: Date.now() - startTime
    })

  } catch (error) {
    console.error('Similarity search error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    // More detailed error logging and response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Detailed similarity search error:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: validatedData || 'Failed to parse body',
      userId,
      organizationId: user?.organizationId,
      timestamp: new Date().toISOString()
    })

    // Return empty results with success status to avoid breaking frontend
    // This allows the chat interface to handle the error gracefully
    return NextResponse.json({
      success: false,
      results: [],
      totalResults: 0,
      processingTimeMs: Date.now() - startTime,
      error: process.env.NODE_ENV === 'development' ? errorMessage : 'Search service temporarily unavailable',
      details: process.env.NODE_ENV === 'development' ? 'Vector search service unavailable. This might be due to Pinecone connectivity issues or OpenAI API rate limits. Consider enabling pgvector fallback.' : undefined
    }, { status: 200 }) // Return 200 so frontend doesn't treat it as a network error
  }
}

/**
 * @swagger
 * /api/v1/search/similarity/requirements:
 *   post:
 *     summary: Find similar contract requirements
 *     description: Search for similar requirements in solicitations and contracts
 *     tags: [Search]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirement
 *             properties:
 *               requirement:
 *                 type: string
 *                 description: Requirement text to match
 *               topK:
 *                 type: number
 *                 description: Number of results (default 10)
 *     responses:
 *       200:
 *         description: Similar requirements found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
async function POST_REQUIREMENTS(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { requirement, topK = 10 } = body

    if (!requirement) {
      return NextResponse.json(
        { error: 'Requirement text required' },
        { status: 400 }
      )
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Search for similar requirements
    const results = await defaultVectorSearch.findSimilarRequirements(
      requirement,
      user.organizationId,
      { topK }
    )

    return NextResponse.json({
      success: true,
      results,
      totalResults: results.length
    })

  } catch (error) {
    console.error('Requirements search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
