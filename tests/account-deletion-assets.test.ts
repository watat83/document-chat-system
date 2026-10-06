import { AccountDeletionService } from '@/lib/account-deletion';
import { db } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { defaultNamespaceManager } from '@/lib/ai/services/pinecone-namespace-manager';
jest.mock('@/lib/db', () => ({ db: { accountDeletion: { findUnique: jest.fn(), update: jest.fn() }, accountDeletionAudit: { create: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('@/lib/stripe-server', () => ({ stripe: {} }));
jest.mock('@clerk/nextjs/server', () => ({ clerkClient: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: { storage: { from: jest.fn() } } }));
jest.mock('@/lib/ai/services/pinecone-namespace-manager', () => ({ defaultNamespaceManager: { deleteOrganizationNamespaces: jest.fn() } }));
const list = jest.fn(); const remove = jest.fn();
const deletion = { id: 'deletion-a', organizationId: 'org-a', status: 'SOFT_DELETED', softDeletedAt: new Date('2026-01-01'), scheduledHardDeleteAt: new Date('2026-02-01'), requestedAt: new Date('2026-01-01') };
beforeEach(() => { jest.clearAllMocks(); (db.accountDeletion.findUnique as jest.Mock).mockResolvedValue(deletion); (supabaseAdmin!.storage.from as jest.Mock).mockReturnValue({ list, remove }); });
test('the grace period is enforced before any external deletion or database mutation', async () => {
  (db.accountDeletion.findUnique as jest.Mock).mockResolvedValue({ ...deletion, scheduledHardDeleteAt: new Date('2999-01-01') });
  await expect(new AccountDeletionService().performHardDeletion('deletion-a')).rejects.toThrow('grace period');
  expect(list).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled();
});
test('storage failures retain database records and mark deletion retryable', async () => {
  list.mockResolvedValue({ data: null, error: new Error('Storage unavailable') });
  await expect(new AccountDeletionService().performHardDeletion('deletion-a')).rejects.toThrow('Storage unavailable');
  expect(db.$transaction).not.toHaveBeenCalled(); expect(defaultNamespaceManager.deleteOrganizationNamespaces).not.toHaveBeenCalled();
  expect(db.accountDeletion.update).toHaveBeenCalledWith({ where: { id: 'deletion-a' }, data: { status: 'FAILED' } });
});
