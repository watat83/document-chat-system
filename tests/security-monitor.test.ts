import { SecurityMonitor } from '@/lib/audit/security-monitor';
import { prisma } from '@/lib/db';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';
jest.mock('@/lib/db', () => ({ prisma: { auditLog: { findMany: jest.fn() }, securityIncident: { create: jest.fn(), findMany: jest.fn() }, user: { findUnique: jest.fn() } } }));
jest.mock('@/lib/audit/crud-audit-logger', () => ({ crudAuditLogger: { logSecurityViolation: jest.fn(), logCRUDOperation: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
test('anomaly events do not recursively trigger another anomaly scan', async () => {
  await SecurityMonitor.monitorEvent({ type: 'ANOMALOUS_USAGE', severity: 'MEDIUM', description: 'Repeated failures', source: 'monitor', organizationId: 'tenant-a', metadata: {}, timestamp: new Date() });
  expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  expect(crudAuditLogger.logCRUDOperation).toHaveBeenCalledWith(expect.anything(), 'SECURITY', 'SECURITY_VIOLATION', 'WARN');
});
test('failed login alerts persist to the current security incident model', async () => {
  (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
  await SecurityMonitor.monitorEvent({ type: 'SUSPICIOUS_ACTIVITY', severity: 'HIGH', description: 'Repeated failures', source: 'login', organizationId: 'tenant-a', metadata: { eventType: 'failed_login', count: 5 }, timestamp: new Date() });
  expect(prisma.securityIncident.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'tenant-a', title: 'Multiple Failed Login Attempts', severity: 'HIGH', incidentType: 'SUSPICIOUS_ACTIVITY' }) }));
});
