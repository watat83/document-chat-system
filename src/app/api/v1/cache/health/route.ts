import { normalizeError } from '@/lib/errors/normalize-error';
import { NextResponse } from 'next/server';
import cacheService from '@/lib/cache/redis';
import { cacheInvalidator } from '@/lib/cache/invalidation';

export async function GET() {
  try {
    // Check Redis connection
    const redisStatus = cacheService.getStatus();

    // Check cache operations
    const testKey = 'health:check:' + Date.now();
    const testValue = JSON.stringify({ timestamp: Date.now(), test: true });

    // Test basic operations
    const setResult = await cacheService.set(testKey, testValue, 10);
    const getResult = await cacheService.get(testKey);
    const existsResult = await cacheService.exists(testKey);
    const deleteResult = await cacheService.del(testKey);

    // Test invalidation system
    const invalidationHealth = await cacheInvalidator.healthCheck();

    // Performance metrics
    const performanceStart = Date.now();
    await cacheService.set('perf:test', 'test', 5);
    const performanceEnd = Date.now();
    const latency = performanceEnd - performanceStart;

    // Clean up
    await cacheService.del('perf:test');

    const allHealthy =
      redisStatus.connected &&
      redisStatus.redis &&
      setResult &&
      getResult === testValue &&
      existsResult &&
      deleteResult &&
      invalidationHealth.healthy;

    const healthStatus = {
      healthy: allHealthy,
      timestamp: new Date().toISOString(),
      redis: {
        connected: redisStatus.connected,
        client: redisStatus.redis,
      },
      operations: {
        set: setResult,
        get: getResult === testValue,
        exists: existsResult,
        delete: deleteResult,
      },
      invalidation: invalidationHealth,
      performance: {
        latency: `${latency}ms`,
        status: latency < 100 ? 'good' : latency < 500 ? 'fair' : 'poor',
      },
    };

    return NextResponse.json(healthStatus, {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (caughtError) {
      const error = normalizeError(caughtError);
    console.error('Cache health check error:', error);

    return NextResponse.json(
      {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
