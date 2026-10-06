import { NextRequest, NextResponse } from 'next/server';
import { auditLogger } from './audit-logger';
import { AuditEventType, AuditCategory, AuditSeverity } from '@prisma/client';

interface RequestMetadata {
  method: string;
  url: string;
  userAgent?: string;
  referer?: string;
  contentLength?: number;
  queryParams?: Record<string, string | string[]>;
}

export async function auditMiddleware(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // Extract request metadata
  const metadata: RequestMetadata = {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent') || undefined,
    referer: request.headers.get('referer') || undefined,
    contentLength: parseInt(request.headers.get('content-length') || '0'),
    queryParams: Object.fromEntries(request.nextUrl.searchParams),
  };

  // Continue with the request
  const response = NextResponse.next();

  // Log after processing
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  const statusCode = response.status;

  // Determine if this is a sensitive endpoint
  const isSensitiveEndpoint = request.nextUrl.pathname.includes('/api/');
  const isAuthEndpoint = request.nextUrl.pathname.includes('/auth');
  const isAdminEndpoint = request.nextUrl.pathname.includes('/admin');

  // Log API requests
  if (isSensitiveEndpoint) {
    const severity = statusCode >= 400 ? AuditSeverity.WARN : AuditSeverity.INFO;
    const eventType = statusCode >= 400 ? AuditEventType.API_REQUEST_FAILED : AuditEventType.API_REQUEST_MADE;

    await auditLogger.log({
      eventType,
      category: AuditCategory.SYSTEM_ADMINISTRATION,
      severity,
      description: `API ${request.method} ${request.nextUrl.pathname} - ${statusCode}`,
      metadata: {
        ...metadata,
        statusCode,
        responseTime,
        correlationId,
        isAuthenticated: request.headers.has('authorization'),
      },
      correlationId,
    }, {
      ipAddress: getClientIP(request),
      userAgent: metadata.userAgent,
    });
  }

  // Log authentication attempts
  if (isAuthEndpoint) {
    const isSuccessful = statusCode < 400;
    await auditLogger.logSecurityEvent(
      isSuccessful ? AuditEventType.USER_LOGIN : AuditEventType.USER_LOGIN_FAILED,
      `Authentication attempt: ${request.nextUrl.pathname}`,
      isSuccessful ? AuditSeverity.INFO : AuditSeverity.WARN,
      {
        ...metadata,
        statusCode,
        success: isSuccessful,
        correlationId,
      }
    );
  }

  // Log admin access
  if (isAdminEndpoint) {
    await auditLogger.logSecurityEvent(
      AuditEventType.API_ENDPOINT_ACCESSED,
      `Admin endpoint accessed: ${request.nextUrl.pathname}`,
      AuditSeverity.INFO,
      {
        ...metadata,
        statusCode,
        correlationId,
      }
    );
  }

  // Add correlation ID to response headers for debugging
  response.headers.set('X-Correlation-ID', correlationId);

  return response;
}

export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const cloudflare = request.headers.get('cf-connecting-ip');

  if (cloudflare) return cloudflare;
  if (forwarded) return forwarded.split(',')[0].trim();
  if (real) return real;

  return 'unknown';
}
