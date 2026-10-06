import type { DocumentSection, DocumentTable, DocumentImage, ExtractedEntity, DocumentEmbeddings, ProcessingStatus, SecurityClassification } from '@/types/documents';

/** Internal analysis result; persisted through the consolidated document JSON columns. */
export interface AIProcessingData {
  status: { status: ProcessingStatus; progress: number; startedAt: string; completedAt: string | null; retryCount: number };
  content: { extractedText: string; summary: string; keywords: string[]; keyPoints: string[]; actionItems: string[]; questions: string[] };
  structure: { sections: DocumentSection[]; tables: DocumentTable[]; images: DocumentImage[]; ocrResults: unknown[] };
  analysis: { qualityScore: number; readabilityScore: number; complexityMetrics: { readabilityScore: number }; entities: ExtractedEntity[]; confidence?: number; scoringMethod?: string; sentiment?: string; suggestions: string[] };
  security?: { classification: SecurityClassification; sensitiveDataDetected: boolean; sensitiveDataTypes: string[]; securityRisks: string[]; complianceIssues: string[]; recommendations: string[]; confidenceScore: number };
  contractAnalysis?: { contractType: string; estimatedValue?: string; timeline?: string; deadlines?: string[]; requirements: string[]; risks: string[]; opportunities: string[] };
  vectorProperties?: DocumentEmbeddings;
  processedAt: string;
  modelVersion: string;
  processingHistory: Array<{ timestamp: string; event: string; success: boolean; details?: string }>;
}
