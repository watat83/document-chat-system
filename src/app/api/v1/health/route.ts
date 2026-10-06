import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function databaseIsAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const healthy = await databaseIsAvailable()
  return NextResponse.json(
    { status: healthy ? 'healthy' : 'unhealthy' },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function HEAD() {
  const healthy = await databaseIsAvailable()
  return new NextResponse(null, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
