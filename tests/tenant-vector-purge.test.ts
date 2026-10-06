import { PineconeNamespaceManager } from '@/lib/ai/services/pinecone-namespace-manager';
import { getPinecone } from '@/lib/ai/services/pinecone-client';
jest.mock('@/lib/ai/services/pinecone-client', () => ({ getPinecone: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
test('account purge removes all historical tenant names without touching another tenant', async () => {
  const deleteAll = jest.fn().mockResolvedValue(undefined);
  const namespace = jest.fn().mockReturnValue({ deleteAll });
  (getPinecone as jest.Mock).mockReturnValue({ index: () => ({ namespace,
    describeIndexStats: async () => ({ namespaces: { oldname_org123: {}, renamed_org123: {}, org_org123: {}, other_org1234: {}, unrelated_org456: {} } }),
  }) });
  await new PineconeNamespaceManager().deleteOrganizationNamespaces('org123');
  expect(namespace.mock.calls.map(call => call[0])).toEqual(['oldname_org123', 'renamed_org123', 'org_org123']);
  expect(deleteAll).toHaveBeenCalledTimes(3);
});
test('vector failures abort account purge instead of pretending deletion finished', async () => {
  (getPinecone as jest.Mock).mockReturnValue({ index: () => ({ describeIndexStats: async () => { throw new Error('Pinecone unavailable'); } }) });
  await expect(new PineconeNamespaceManager().deleteOrganizationNamespaces('org123')).rejects.toThrow('Pinecone unavailable');
});
