import { auth } from '@clerk/nextjs/server';
/**
 * Docling Service Proxy
 *
 * Proxies requests to the Docling document processing service deployed on Railway.
 * This allows us to maintain a single domain for the frontend while the Docling
 * service runs separately.
 *
 * Path: /api/docling/* → https://your-railway-url/*
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOCLING_SERVICE_URL = process.env.DOCLING_SERVICE_URL || 'http://localhost:8001';
const DOCLING_ENABLED = process.env.DOCLING_ENABLED !== 'false';
const DOCLING_TIMEOUT = parseInt(process.env.DOCLING_TIMEOUT || '60000'); // 60 seconds for Railway cold starts

export async function GET(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleDoclingRequest(request, params.path, 'GET');
}

export async function POST(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleDoclingRequest(request, params.path, 'POST');
}

export async function PUT(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleDoclingRequest(request, params.path, 'PUT');
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleDoclingRequest(request, params.path, 'DELETE');
}

async function handleDoclingRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.NODE_ENV === 'production' && !process.env.DOCLING_API_TOKEN) return NextResponse.json({ error: 'Private processing service is not configured' }, { status: 503 });
  if (pathSegments.some(segment => !/^[a-zA-Z0-9_-]+$/.test(segment)) || !['health', 'process', 'supported-formats'].includes(pathSegments[0])) return NextResponse.json({ error: 'Unsupported processing endpoint' }, { status: 404 });
    // Check if Docling is enabled
  if (!DOCLING_ENABLED) {
    return NextResponse.json(
      {
        error: 'Docling service is not enabled',
        message: 'Set DOCLING_ENABLED=true to use the Docling service'
      },
      { status: 503 }
    );
  }

  try {
    // Construct the target URL
    const path = pathSegments.join('/');
    const targetUrl = `${DOCLING_SERVICE_URL}/${path}`;

    // Get search params from original request
    const searchParams = request.nextUrl.searchParams.toString();
    const fullUrl = searchParams ? `${targetUrl}?${searchParams}` : targetUrl;

    // Prepare headers
    const headers = new Headers();
    const contentTypeHeader = request.headers.get('content-type');
    if (contentTypeHeader) headers.set('Content-Type', contentTypeHeader);
    headers.set('Accept', 'application/json');
    if (process.env.DOCLING_API_TOKEN) headers.set('Authorization', `Bearer ${process.env.DOCLING_API_TOKEN}`);

    // Create abort controller for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOCLING_TIMEOUT);

    // Prepare fetch options with timeout
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    // Add body for POST/PUT requests
    if (method === 'POST' || method === 'PUT') {
      const contentType = request.headers.get('content-type');

      if (contentType?.includes('multipart/form-data')) {
        // For multipart form data, pass through as-is
        fetchOptions.body = await request.arrayBuffer();
      } else if (contentType?.includes('application/json')) {
        // For JSON, parse and re-stringify to ensure valid JSON
        try {
          const json = await request.json();
          fetchOptions.body = JSON.stringify(json);
        } catch (e) {
          fetchOptions.body = await request.text();
        }
      } else {
        // For other content types, pass through as text
        fetchOptions.body = await request.text();
      }
    }

    let response: Response;
    try { response = await fetch(fullUrl, fetchOptions); }
    finally { clearTimeout(timeoutId); }

    // Get response body
    const contentType = response.headers.get('content-type');
    let body;

    if (contentType?.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    // Return the response
    return new NextResponse(
      typeof body === 'string' ? body : JSON.stringify(body),
      {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Docling proxy error:', error);

    return NextResponse.json(
      {
        error: 'Failed to proxy request to Docling service',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
