import type { Prisma, Document as DatabaseDocument } from '@prisma/client';

type ResponseDocument = DatabaseDocument & {
  folder?: { id: string; name: string } | null;
  uploadedBy?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
};

/** A single response shape for reads and updates of consolidated documents. */
export function serializeDocument(document: ResponseDocument) {
    const getFileTypeFromMimeType = (mimeType: string, fileName: string) => {
      if (!mimeType && fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        return ext || 'unknown';
      }
      return mimeType?.split('/')[0] || 'unknown';
    };

    const object = (value: Prisma.JsonValue | undefined): Prisma.JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const array = (value: Prisma.JsonValue | undefined): Prisma.JsonArray => Array.isArray(value) ? value : [];
    const content = object(document.content);
    const entities = object(document.entities);
    const rawSharing = object(document.sharing);
    const rawShare = object(rawSharing.share);
    const { password: _password, passwordHash: _passwordHash, ...publicShare } = rawShare;
    const sharing = { ...rawSharing, share: rawSharing.share ? { ...publicShare, hasPassword: !!(_passwordHash || _password) } : null };
    const processing = object(document.processing);
    const events = array(processing.events).map(object);
    const completed = events.find(event => event.eventType === 'COMPLETED');
    const failed = events.find(event => event.success === false);
    const analysis = object(document.analysis);
    const contract = object(analysis.contract);
    const compliance = object(analysis.compliance);
    const revisions = document.revisions;
    const embeddings = document.embeddings;
    const status = typeof processing.currentStatus === 'string' ? processing.currentStatus : 'PENDING';

    return {
      // Core document fields
      id: document.id,
      name: document.name,
      folderId: document.folderId,
      size: document.size || 0,
      mimeType: document.mimeType || 'application/octet-stream',
      organizationId: document.organizationId,
      uploadedById: document.uploadedById,
      description: document.description,
      documentType: document.documentType,
      securityClassification: document.securityClassification,
      workflowStatus: document.workflowStatus,
      tags: document.tags || [],
      isEditable: document.isEditable,
      
      // Extracted content
      extractedText: document.extractedText || '',
      summary: document.summary || '',
      
      // Computed/derived fields
      type: getFileTypeFromMimeType(document.mimeType, document.name),
      filePath: `/api/v1/documents/${document.id}/download`,
      uploadDate: document.uploadDate.toISOString(),
      lastModified: document.updatedAt.toISOString(),
      updatedBy: document.uploadedBy ? 
        `${document.uploadedBy.firstName || ''} ${document.uploadedBy.lastName || ''}`.trim() || document.uploadedBy.email : 
        'Unknown',
      
      // Processing status from JSON field
      status,
      progress: processing.progress ?? 0,
      processedAt: completed?.timestamp,
      processingError: failed?.error,
      
      // JSON field data (consolidated structure)
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      deletedAt: document.deletedAt?.toISOString() ?? null,
      revisions,
      content: content,
      entities: entities,
      sharing: sharing,
      processing: processing,
      analysis: analysis,
      embeddings: embeddings,
      
      // Relations
      uploadedBy: document.uploadedBy,
      folder: document.folder,
      
      // Legacy compatibility (construct from JSON fields)
      aiData: {
        status: {
          status,
          progress: processing.progress ?? 0,
          startedAt: document.createdAt.toISOString(),
          completedAt: completed?.timestamp,
          retryCount: events.filter(event => event.success === false).length
        },
        content: {
          extractedText: document.extractedText || '',
          summary: document.summary || '',
          keywords: [],
          keyPoints: [],
          actionItems: [],
          questions: []
        },
        structure: {
          sections: content.sections || [],
          tables: content.tables || [],
          images: content.images || [],
          ocrResults: []
        },
        analysis: {
          qualityScore: contract.qualityScore,
          readabilityScore: compliance.score,
          complexityMetrics: { readabilityScore: compliance.score },
          entities: array(entities.entities),
          confidence: analysis.confidence,
          suggestions: array(compliance.recommendations)
        },
        processedAt: completed?.timestamp,
        modelVersion: 'consolidated-v2.0',
        processingHistory: events
      },
      
      // Only persisted findings can establish PII and compliance status.
      securityAnalysis: analysis.security ?? undefined,
    };


}
