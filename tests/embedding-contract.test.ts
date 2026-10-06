import { EmbeddingService } from '@/lib/ai/services/embedding-service';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { getPinecone } from '@/lib/ai/services/pinecone-client';
import type { DocumentChunk } from '@/lib/ai/services/document-chunker';
import type { EmbeddingDocument } from '@/lib/ai/services/embedding-document';
jest.mock('@/lib/ai/ai-service-manager', () => ({ AIServiceManager: { getInstance: jest.fn() } }));
jest.mock('@/lib/ai/services/pinecone-client', () => ({ getPinecone: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/ai/services/pinecone-namespace-manager', () => ({ defaultNamespaceManager: {
  getOrCreateNamespace: jest.fn().mockResolvedValue({ namespace: 'tenant-a', created: false }), getNamespaceStats: jest.fn().mockResolvedValue({}),
} }));
const generateEmbedding = jest.fn();
const upsert = jest.fn();
const document: EmbeddingDocument = { id: 'doc-a', organizationId: 'tenant-a', name: 'Contract', documentType: 'OTHER', tags: [], extractedText: '', summary: null, content: {}, embeddings: {} };
const chunk = (content = 'Full contract text', index = 0): DocumentChunk => ({ id: `doc-a-${index}`, chunkIndex: index, content, startChar: index * 100, endChar: index * 100 + content.length, tokenCount: 10, keywords: [] });
beforeEach(() => {
  jest.clearAllMocks();
  (AIServiceManager.getInstance as jest.Mock).mockReturnValue({ generateEmbedding });
  (getPinecone as jest.Mock).mockReturnValue({ index: () => ({ namespace: () => ({ upsert }) }) });
  upsert.mockResolvedValue({});
});
test.each([[], [[1]], [[1, NaN]], [[1, 2], [3, 4]]].map(embedding => ({ embedding })))('malformed embedding matrices never reach vector storage: %j', async ({ embedding }) => {
  generateEmbedding.mockResolvedValue({ embedding });
  await expect(new EmbeddingService({ dimensions: 2 }).generateAndStoreEmbeddings([chunk()], document)).rejects.toThrow();
  expect(upsert).not.toHaveBeenCalled();
});
test.each(['', 'a'.repeat(30001)])('empty and oversized chunks are rejected without dropping content', async content => {
  await expect(new EmbeddingService({ dimensions: 2 }).generateAndStoreEmbeddings([chunk(content)], document)).rejects.toThrow();
  expect(generateEmbedding).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
});
test('successful indexing retains complete chunk text and unique generation references', async () => {
  generateEmbedding.mockResolvedValue({ embedding: [[1, 2]] });
  const service = new EmbeddingService({ dimensions: 2 });
  const first = await service.generateAndStoreEmbeddings([chunk()], document);
  const second = await service.generateAndStoreEmbeddings([chunk()], document);
  expect(first.chunks[0].content).toBe(chunk().content);
  expect(first.chunks[0].vectorId).not.toBe(second.chunks[0].vectorId);
  expect(generateEmbedding).toHaveBeenCalledWith(expect.objectContaining({ text: [chunk().content], dimensions: 2, metadata: { organizationId: 'tenant-a', taskType: 'embedding' } }));
});
test('partial batch failures cannot produce a successful index', async () => {
  generateEmbedding.mockResolvedValueOnce({ embedding: [[1, 2]] }).mockRejectedValueOnce(new Error('Provider unavailable'));
  await expect(new EmbeddingService({ dimensions: 2, batchSize: 1 }).generateAndStoreEmbeddings([chunk(), chunk('Second chunk', 1)], document)).rejects.toThrow('Only 1/2 chunks');
  expect(upsert).toHaveBeenCalledTimes(1);
});
