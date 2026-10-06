import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

interface DatabaseHealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: {
    connectivity: {
      status: 'pass' | 'fail'
      responseTime: number
      details?: string
    }
    queryPerformance: {
      status: 'pass' | 'warn' | 'fail'
      simpleQueryTime: number
      complexQueryTime: number
      details?: string
    }
    connectionPool: {
      status: 'pass' | 'warn' | 'fail'
      details: {
        active: number
        idle: number
        total: number
      }
    }
    dataIntegrity: {
      status: 'pass' | 'fail'
      checks: {
        orphanedRecords: number
        referentialIntegrity: boolean
        dataConsistency: boolean
      }
      details?: string
    }
    rlsPolicies: {
      status: 'pass' | 'fail'
      enabledTables: number
      totalPolicies: number
      details?: string
    }
  }
  metrics: {
    totalUsers: number
    totalOrganizations: number
    totalOpportunities: number
    totalMatchScores: number
    avgQueryTime: number
    uptime: number
  }
  recommendations?: string[]
}

/**
 * @swagger
 * /api/health/db:
 *   get:
 *     summary: Database health check
 *     description: |
 *       Comprehensive database health check endpoint that validates:
 *       - Database connectivity and response times
 *       - Query performance metrics
 *       - Connection pool status
 *       - Data integrity checks
 *       - Row-Level Security (RLS) policy status
 *       - Key database metrics
 *       
 *       Include the header `x-detailed-health: true` for detailed metrics.
 *     tags:
 *       - Health
 *     security: []
 *     parameters:
 *       - in: header
 *         name: x-detailed-health
 *         schema:
 *           type: string
 *           enum: ['true']
 *         description: Include detailed health metrics
 *     responses:
 *       200:
 *         description: Database health status (healthy or degraded)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                   description: Overall health status
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Check timestamp
 *                 checks:
 *                   type: object
 *                   properties:
 *                     connectivity:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [pass, fail]
 *                         responseTime:
 *                           type: number
 *                           description: Connection response time in milliseconds
 *                     queryPerformance:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [pass, warn, fail]
 *                         simpleQueryTime:
 *                           type: number
 *                         complexQueryTime:
 *                           type: number
 *                     connectionPool:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [pass, warn, fail]
 *                         details:
 *                           type: object
 *                           properties:
 *                             active:
 *                               type: number
 *                             idle:
 *                               type: number
 *                             total:
 *                               type: number
 *                     dataIntegrity:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [pass, fail]
 *                         checks:
 *                           type: object
 *                           properties:
 *                             orphanedRecords:
 *                               type: number
 *                             referentialIntegrity:
 *                               type: boolean
 *                             dataConsistency:
 *                               type: boolean
 *                     rlsPolicies:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [pass, fail]
 *                         enabledTables:
 *                           type: number
 *                         totalPolicies:
 *                           type: number
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: number
 *                     totalOrganizations:
 *                       type: number
 *                     totalOpportunities:
 *                       type: number
 *                     totalMatchScores:
 *                       type: number
 *                     avgQueryTime:
 *                       type: number
 *                     uptime:
 *                       type: number
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *             example:
 *               status: healthy
 *               timestamp: "2024-01-20T10:30:00Z"
 *               checks:
 *                 connectivity:
 *                   status: pass
 *                   responseTime: 45
 *                 queryPerformance:
 *                   status: pass
 *                   simpleQueryTime: 12
 *                   complexQueryTime: 85
 *               metrics:
 *                 totalUsers: 156
 *                 totalOrganizations: 42
 *                 totalOpportunities: 3892
 *                 totalMatchScores: 9456
 *                 avgQueryTime: 48.5
 *                 uptime: 1234
 *               recommendations: []
 *       503:
 *         description: Service unavailable - Database is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [unhealthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 error:
 *                   type: string
 *                   description: Error message if health check failed
 */
export async function GET() {
  const startTime = Date.now()
  
  try {
    // Check if this is an authenticated request for detailed metrics
    const headersList = await headers()
    const isDetailed = headersList.get('x-detailed-health') === 'true'
    
    const healthMetrics: DatabaseHealthMetrics = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        connectivity: { status: 'pass', responseTime: 0 },
        queryPerformance: { status: 'pass', simpleQueryTime: 0, complexQueryTime: 0 },
        connectionPool: { status: 'pass', details: { active: 0, idle: 0, total: 0 } },
        dataIntegrity: { 
          status: 'pass', 
          checks: { orphanedRecords: 0, referentialIntegrity: true, dataConsistency: true }
        },
        rlsPolicies: { status: 'pass', enabledTables: 0, totalPolicies: 0 }
      },
      metrics: {
        totalUsers: 0,
        totalOrganizations: 0,
        totalOpportunities: 0,
        totalMatchScores: 0,
        avgQueryTime: 0,
        uptime: 0
      },
      recommendations: []
    }

    // 1. Test basic connectivity
    const connectivityStart = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1 as test`
      healthMetrics.checks.connectivity.responseTime = Date.now() - connectivityStart
      healthMetrics.checks.connectivity.status = 'pass'
    } catch (error) {
      healthMetrics.checks.connectivity.status = 'fail'
      healthMetrics.checks.connectivity.details = error instanceof Error ? error.message : 'Unknown error'
      healthMetrics.status = 'unhealthy'
    }

    // 2. Test query performance
    if (healthMetrics.checks.connectivity.status === 'pass') {
      // Simple query test
      const simpleStart = Date.now()
      try {
        await prisma.organization.count()
        healthMetrics.checks.queryPerformance.simpleQueryTime = Date.now() - simpleStart
      } catch {
        healthMetrics.checks.queryPerformance.status = 'fail'
        healthMetrics.checks.queryPerformance.details = 'Simple query failed'
        healthMetrics.status = 'unhealthy'
      }

      // Complex query test (only if detailed health check)
      if (isDetailed) {
        const complexStart = Date.now()
        try {
          await prisma.document.findMany({
            take: 10,
            include: {
              folder: { select: { name: true } },
              uploadedBy: { select: { email: true } }
            },
            orderBy: { createdAt: 'desc' }
          })
          healthMetrics.checks.queryPerformance.complexQueryTime = Date.now() - complexStart
        } catch {
          healthMetrics.checks.queryPerformance.status = 'fail'
          healthMetrics.checks.queryPerformance.details = 'Complex query failed'
        }
      }

      // Evaluate query performance
      const avgQueryTime = (healthMetrics.checks.queryPerformance.simpleQueryTime + healthMetrics.checks.queryPerformance.complexQueryTime) / 2
      if (avgQueryTime > 2000) {
        healthMetrics.checks.queryPerformance.status = 'fail'
        healthMetrics.status = 'unhealthy'
        healthMetrics.recommendations?.push('Database queries are slow (>2s). Consider query optimization.')
      } else if (avgQueryTime > 500) {
        healthMetrics.checks.queryPerformance.status = 'warn'
        if (healthMetrics.status === 'healthy') healthMetrics.status = 'degraded'
        healthMetrics.recommendations?.push('Database queries are slower than optimal (>500ms).')
      }
    }

    // 3. Check connection pool status (PostgreSQL specific)
    if (isDetailed && healthMetrics.checks.connectivity.status === 'pass') {
      try {
        const poolStats = await prisma.$queryRaw<Array<{
          state: string
          count: bigint
        }>>`
          SELECT state, count(*) as count
          FROM pg_stat_activity 
          WHERE datname = current_database()
          GROUP BY state
        `
        
        let active = 0, idle = 0
        poolStats.forEach(stat => {
          const count = Number(stat.count)
          if (stat.state === 'active') active = count
          else if (stat.state === 'idle') idle = count
        })
        
        const total = active + idle
        healthMetrics.checks.connectionPool.details = { active, idle, total }
        
        // Evaluate connection pool health
        if (total > 80) {
          healthMetrics.checks.connectionPool.status = 'warn'
          if (healthMetrics.status === 'healthy') healthMetrics.status = 'degraded'
          healthMetrics.recommendations?.push('High number of database connections. Monitor for connection leaks.')
        }
        if (active > 50) {
          healthMetrics.checks.connectionPool.status = 'fail'
          healthMetrics.status = 'unhealthy'
          healthMetrics.recommendations?.push('Too many active database connections. Investigate performance issues.')
        }
      } catch {
        healthMetrics.checks.connectionPool.status = 'fail'
        healthMetrics.checks.connectionPool.details = { active: -1, idle: -1, total: -1 }
      }
    }

    // 4. Check data integrity (detailed check only)
    if (isDetailed && healthMetrics.checks.connectivity.status === 'pass') {
      try {
        // Check for orphaned records
        const orphanedUsers = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) as count 
          FROM users u 
          LEFT JOIN organizations o ON u.organization_id = o.id 
          WHERE o.id IS NULL
        `
        
        const orphanedProfiles = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) as count 
          FROM profiles p 
          LEFT JOIN organizations o ON p.organization_id = o.id 
          WHERE o.id IS NULL
        `
        
        const orphanedCount = Number(orphanedUsers[0]?.count || 0) + Number(orphanedProfiles[0]?.count || 0)
        healthMetrics.checks.dataIntegrity.checks.orphanedRecords = orphanedCount
        
        if (orphanedCount > 0) {
          healthMetrics.checks.dataIntegrity.status = 'fail'
          healthMetrics.status = 'unhealthy'
          healthMetrics.checks.dataIntegrity.details = `Found ${orphanedCount} orphaned records`
          healthMetrics.recommendations?.push('Data integrity issues detected. Run data cleanup.')
        }
      } catch {
        healthMetrics.checks.dataIntegrity.status = 'fail'
        healthMetrics.checks.dataIntegrity.details = 'Failed to check data integrity'
      }
    }

    // 5. Check RLS policies
    if (isDetailed && healthMetrics.checks.connectivity.status === 'pass') {
      try {
        const rlsStatus = await prisma.$queryRaw<Array<{
          tablename: string
          rowsecurity: boolean
        }>>`
          SELECT tablename, rowsecurity 
          FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename IN (
            'organizations', 'users', 'profiles', 'opportunities', 
            'match_scores', 'documents', 'pipelines'
          )
        `
        
        const policies = await prisma.$queryRaw<Array<{
          policyname: string
        }>>`
          SELECT policyname 
          FROM pg_policies 
          WHERE schemaname = 'public'
        `
        
        const enabledTables = rlsStatus.filter(table => table.rowsecurity).length
        const totalPolicies = policies.length
        
        healthMetrics.checks.rlsPolicies.enabledTables = enabledTables
        healthMetrics.checks.rlsPolicies.totalPolicies = totalPolicies
        
        if (enabledTables < rlsStatus.length) {
          healthMetrics.checks.rlsPolicies.status = 'fail'
          healthMetrics.status = 'unhealthy'
          healthMetrics.checks.rlsPolicies.details = 'Some tables missing RLS policies'
          healthMetrics.recommendations?.push('Row-Level Security not enabled on all tables. Security vulnerability.')
        }
      } catch {
        healthMetrics.checks.rlsPolicies.status = 'fail'
        healthMetrics.checks.rlsPolicies.details = 'Failed to check RLS policies'
      }
    }

    // 6. Collect key metrics
    if (healthMetrics.checks.connectivity.status === 'pass') {
      try {
        const [userCount, orgCount, docCount, folderCount] = await Promise.all([
          prisma.user.count(),
          prisma.organization.count(),
          prisma.document.count(),
          prisma.folder.count()
        ])

        healthMetrics.metrics = {
          totalUsers: userCount,
          totalOrganizations: orgCount,
          totalDocuments: docCount,
          totalFolders: folderCount,
          avgQueryTime: (healthMetrics.checks.queryPerformance.simpleQueryTime + healthMetrics.checks.queryPerformance.complexQueryTime) / 2,
          uptime: Date.now() - startTime
        }
      } catch (error) {
        // Metrics collection failure shouldn't affect overall health
        console.warn('Failed to collect metrics')
      }
    }

    // 7. Final health assessment
    const hasFailures = Object.values(healthMetrics.checks).some(check => check.status === 'fail')
    const hasWarnings = Object.values(healthMetrics.checks).some(check => check.status === 'warn')
    
    if (hasFailures) {
      healthMetrics.status = 'unhealthy'
    } else if (hasWarnings) {
      healthMetrics.status = 'degraded'
    }

    // Return appropriate status code
    const statusCode = healthMetrics.status === 'healthy' ? 200 : 
                      healthMetrics.status === 'degraded' ? 200 : 503

    return NextResponse.json(healthMetrics, { status: statusCode })

  } catch (error) {
    console.error('Database health check failed:', error)
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      checks: {
        connectivity: { status: 'fail', responseTime: Date.now() - startTime }
      }
    }, { status: 503 })
  } finally {
    // Don't disconnect here as it might be used by other requests
  }
}