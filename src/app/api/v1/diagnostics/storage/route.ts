import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { prisma } from '@/lib/db';

/**
 * Diagnostics endpoint for storage configuration
 *
 * Tests:
 * - Supabase client initialization
 * - Database connectivity
 * - Storage bucket existence
 * - Storage bucket policies
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      status: 'checking',
      checks: {}
    };

    // Check 1: Supabase client initialization
    diagnostics.checks.supabaseClient = {
      status: supabaseAdmin ? 'OK' : 'FAILED',
      message: supabaseAdmin
        ? 'Supabase admin client initialized'
        : 'Supabase admin client not initialized - check SUPABASE_SERVICE_ROLE_KEY',
      configured: !!supabaseAdmin
    };

    // Check 2: Environment variables
    diagnostics.checks.environmentVariables = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      status: (!!process.env.NEXT_PUBLIC_SUPABASE_URL &&
               !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
               !!process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'OK' : 'FAILED'
    };

    // Check 3: Database connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
      diagnostics.checks.database = {
        status: 'OK',
        message: 'Database connection successful'
      };
    } catch (error: any) {
      diagnostics.checks.database = {
        status: 'FAILED',
        message: 'Database connection failed',
        error: error.message
      };
    }

    // Check 4: Storage bucket existence
    if (supabaseAdmin) {
      try {
        const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();

        if (bucketsError) {
          diagnostics.checks.storageBuckets = {
            status: 'FAILED',
            message: 'Failed to list storage buckets',
            error: bucketsError.message
          };
        } else {
          const documentsBucket = buckets?.find(b => b.name === 'documents');
          diagnostics.checks.storageBuckets = {
            status: documentsBucket ? 'OK' : 'WARNING',
            message: documentsBucket
              ? 'Documents bucket exists'
              : 'Documents bucket not found - needs to be created',
            buckets: buckets?.map(b => ({
              name: b.name,
              public: b.public,
              file_size_limit: b.file_size_limit
            })),
            documentsBucketExists: !!documentsBucket,
            documentsBucketPublic: documentsBucket?.public
          };
        }
      } catch (error: any) {
        diagnostics.checks.storageBuckets = {
          status: 'FAILED',
          message: 'Failed to check storage buckets',
          error: error.message
        };
      }

      // Check 5: Test upload (small test file)
      if (diagnostics.checks.storageBuckets?.documentsBucketExists) {
        try {
          const testFileName = `test-${Date.now()}.txt`;
          const testContent = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" in bytes

          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('documents')
            .upload(`test/${testFileName}`, testContent, {
              contentType: 'text/plain',
              upsert: true
            });

          if (uploadError) {
            diagnostics.checks.storageUpload = {
              status: 'FAILED',
              message: 'Test upload failed - likely missing storage policies',
              error: uploadError.message,
              errorCode: uploadError.name,
              statusCode: 'status' in uploadError ? uploadError.status : undefined,
              solution: 'Add storage policy: CREATE POLICY "Allow all operations for service role" ON storage.objects FOR ALL USING (bucket_id = \'documents\');'
            };
          } else {
            diagnostics.checks.storageUpload = {
              status: 'OK',
              message: 'Test upload successful',
              testFilePath: uploadData.path
            };

            // Clean up test file
            try {
              await supabaseAdmin.storage
                .from('documents')
                .remove([uploadData.path]);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        } catch (error: any) {
          diagnostics.checks.storageUpload = {
            status: 'FAILED',
            message: 'Test upload failed with exception',
            error: error.message
          };
        }
      }
    }

    // Overall status
    const allChecks = Object.values(diagnostics.checks);
    const failedChecks = allChecks.filter((check: any) => check.status === 'FAILED');
    const warningChecks = allChecks.filter((check: any) => check.status === 'WARNING');

    if (failedChecks.length > 0) {
      diagnostics.status = 'FAILED';
      diagnostics.message = `${failedChecks.length} check(s) failed`;
    } else if (warningChecks.length > 0) {
      diagnostics.status = 'WARNING';
      diagnostics.message = `${warningChecks.length} warning(s)`;
    } else {
      diagnostics.status = 'OK';
      diagnostics.message = 'All checks passed';
    }

    return NextResponse.json(diagnostics, { status: 200 });

  } catch (error: any) {
    console.error('Diagnostics error:', error);
    return NextResponse.json(
      {
        error: 'Diagnostics failed',
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
