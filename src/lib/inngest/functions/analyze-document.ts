import { randomUUID } from 'node:crypto';
import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { documentProcessor } from '@/lib/ai/document-processor';
import { documentSectionsAnalyzer } from '@/lib/ai/services/document-sections-analyzer';
import { documentMetadataAnalyzer } from '@/lib/ai/services/document-metadata-analyzer';
import { documentContentAnalyzer } from '@/lib/ai/services/document-content-analyzer';
import { documentSecurityAnalyzer } from '@/lib/ai/services/document-security-analyzer';
import { entityExtractor } from '@/lib/ai/services/entity-extractor';
import { contractAnalyzer } from '@/lib/ai/services/contract-analyzer';
import { DocumentScoringService } from '@/lib/ai/document-scoring';
import { assertProcessingRun, jsonObject, processingSnapshot, processingTransition, updateProcessingDocument, updateProcessingState } from '@/lib/documents/processing-state';

/** Durable analysis stores successful components and explicitly reports missing ones. */
export const analyzeDocument = inngest.createFunction(
  { id: 'analyze-document-v2', name: 'Analyze Document v2', retries: 2, concurrency: { limit: 3 },
    cancelOn: [{ event: 'document/process.cancelled', if: 'async.data.documentId == event.data.documentId && async.data.organizationId == event.data.organizationId && (!async.data.runId || async.data.runId == event.data.runId)' }],
  },
  { event: 'document/process.analyze' },
  async ({ event, step }) => {
    const { documentId, organizationId, options = {}, metadata = {}, runId: requestedRunId } = event.data;
    let runId: string | undefined = requestedRunId;
    const startedAt = Date.now();
    try {
      const document = await step.run('fetch-document', async () => {
        const current = await prisma.document.findFirst({ where: { id: documentId, organizationId, deletedAt: null } });
        if (!current) throw new Error('Document not found');
        const started = await updateProcessingState(documentId, state => {
          assertProcessingRun(state, requestedRunId);
          return processingTransition(state, 'PROCESSING');
        }, organizationId);
        return { ...current, processing: started.processing };
      });
      runId = processingSnapshot(document.processing).runId ?? undefined;
      const text = await step.run('prepare-content', async () => {
        const sections = jsonObject(document.content).sections;
        const editorText = Array.isArray(sections) ? sections.map(section => jsonObject(section).content).filter((content): content is string => typeof content === 'string').join('\n\n').trim() : '';
        if (metadata.hasEditorContent && editorText) return editorText;
        if (!options.forceReprocess && document.extractedText?.trim()) return document.extractedText;
        const extracted = await documentProcessor.extractTextOnly(documentId, options.forceReprocess === true);
        if (!extracted.success || !extracted.extractedText?.trim()) throw new Error(extracted.error || 'No text available for analysis');
        return extracted.extractedText;
      });
      const failed: string[] = [];
      // Provider calls are durable steps; retrying the final database write never reissues them.
      const sections = await step.run('analyze-sections', () => documentSectionsAnalyzer.analyzeSections(text, document.name, document.documentType));
      if (!sections.success || !sections.sections) failed.push('sections');
      const metadataResult = await step.run('analyze-metadata', () => documentMetadataAnalyzer.analyzeMetadata(text, document.name, organizationId));
      if (!metadataResult.success || !metadataResult.metadata) failed.push('metadata');
      const content = await step.run('analyze-content', () => documentContentAnalyzer.analyzeContent(text, document.name, document.documentType));
      if (!content.success || !content.analysis) failed.push('content');
      const entities = options.includeEntityExtraction === false ? null : await step.run('extract-entities', () => entityExtractor.extractEntities(text, document.documentType, document.name));
      if (entities && (!entities.success || !entities.entities)) failed.push('entities');
      const security = options.includeSecurityAnalysis === false ? null : await step.run('analyze-security', () => documentSecurityAnalyzer.analyzeSecurity(text, document.name));
      if (security && (!security.success || !security.analysis)) failed.push('security');
      const contract = options.includeContractAnalysis === false ? null : await step.run('analyze-contract', () => contractAnalyzer.analyzeContract(text, document.name, document.documentType, organizationId));
      if (contract && (!contract.success || !contract.analysis)) failed.push('contract');
      if (options.includeComplianceCheck === true) failed.push('compliance'); // No regulation/review criteria supplied; never claim compliance.
      const quality = options.includeQualityScoring === false ? null : await step.run('score-quality', async () => {
        try { return await DocumentScoringService.getInstance().scoreDocument({ content: text, title: document.name, documentType: document.documentType }, { organizationId, documentType: document.documentType }); }
        catch { return null; }
      });
      if (options.includeQualityScoring !== false && !quality) failed.push('quality');
      const updated = await step.run('save-results', () => updateProcessingDocument(documentId, organizationId, current => {
        if (current.extractedText !== document.extractedText || JSON.stringify(current.content) !== JSON.stringify(document.content)) throw new Error('Document content changed during analysis');
        const currentAnalysis = jsonObject(current.analysis);
        const entityValues = entities?.success && entities.entities ? entities.entities.map(entity => ({ ...entity, id: randomUUID(), type: entityExtractor.determineProperEntityType(entity) })) : undefined;
        const data = {
          extractedText: text,
          ...(current.extractedText !== text && { embeddings: {} }),
          ...(content.success && content.analysis && { summary: content.analysis.summary }),
          content: { ...jsonObject(current.content), ...(sections.success && sections.sections && { sections: sections.sections.map(section => ({ ...section, id: section.id || randomUUID() })) }), ...(content.success && content.analysis && { summary: content.analysis.summary, keyPoints: content.analysis.keyPoints, actionItems: content.analysis.actionItems, questions: content.analysis.questions }) },
          analysis: { ...currentAnalysis, ...(content.success && content.analysis && { ...content.analysis }), ...(metadataResult.success && metadataResult.metadata && { metadata: metadataResult.metadata }), ...(security?.success && security.analysis && { security: security.analysis }), ...(contract?.success && contract.analysis && { contract: contract.analysis }), ...(quality && { qualityScore: quality.overallScore, scoring: quality }), unavailableOperations: failed, completedAt: new Date().toISOString() },
          ...(entityValues && { entities: { ...jsonObject(current.entities), entities: entityValues, totalCount: entityValues.length, extractedAt: new Date().toISOString() } }),
          ...(metadataResult.success && metadataResult.metadata && { documentType: metadataResult.metadata.documentType, tags: metadataResult.metadata.tags }),
          processing: { ...processingTransition(current.processing, options.deferCompletion ? 'PROCESSING' : failed.length ? 'PARTIAL' : 'COMPLETED'), progress: options.deferCompletion ? 90 : 100, unavailableOperations: failed },
        };
        return JSON.parse(JSON.stringify(data));
      }, runId));
      return { success: failed.length === 0, documentId, runId, status: processingSnapshot(updated.processing).currentStatus, unavailableOperations: failed, processingTime: Date.now() - startedAt };
    } catch (error) {
      if (runId) await updateProcessingState(documentId, current => current.runId !== runId || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Document analysis failed'), organizationId);
      throw error;
    }
  }
);
