jest.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: jest.fn() } }))

import { prisma } from '@/lib/prisma'
import { GET, HEAD } from '@/app/api/v1/health/route'

const query = prisma.$queryRaw as jest.Mock

afterEach(() => query.mockReset())

test('reports a healthy database without exposing diagnostics', async () => {
  query.mockResolvedValue([{ '?column?': 1 }])

  const response = await GET()

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'healthy' })
  expect(response.headers.get('cache-control')).toBe('no-store')
})

test('returns a generic unavailable response when the database is down', async () => {
  query.mockRejectedValue(new Error('private connection details'))

  const response = await GET()

  expect(response.status).toBe(503)
  expect(await response.text()).toBe('{"status":"unhealthy"}')
})

test('preserves a bodyless HEAD probe', async () => {
  query.mockResolvedValue([{ '?column?': 1 }])

  const response = await HEAD()

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('')
})
