import { DocumentScoringService } from '@/lib/ai/document-scoring';
import { simpleAIClient } from '@/lib/ai/services/simple-ai-client';
jest.mock('@/lib/ai/services/simple-ai-client', () => ({ simpleAIClient: { generateCompletion: jest.fn() } }));
const score = (content: string) => {
  (simpleAIClient.generateCompletion as jest.Mock).mockResolvedValue({ content, model: 'actual-model' });
  return DocumentScoringService.getInstance().scoreDocument({ content: 'Original document', title: 'Document' });
};
test('invalid provider output fails instead of manufacturing average scores', async () => {
  await expect(score('Provider could not analyze the document')).rejects.toThrow('did not contain JSON');
});
test('missing criteria fail validation', async () => {
  await expect(score('{"relevance":90}')).rejects.toThrow();
});
test('out-of-range or nonnumeric criteria fail validation', async () => {
  await expect(score('{"relevance":101,"compliance":50,"completeness":50,"technicalMerit":50,"riskAssessment":50}')).rejects.toThrow();
  await expect(score('{"relevance":"high","compliance":50,"completeness":50,"technicalMerit":50,"riskAssessment":50}')).rejects.toThrow();
});
test('explicit zero scores remain valid and the provider model is preserved', async () => {
  const result = await score('{"relevance":0,"compliance":0,"completeness":0,"technicalMerit":0,"riskAssessment":0}');
  expect(result.overallScore).toBe(0);
  expect(result.scoringModel).toBe('actual-model');
});
