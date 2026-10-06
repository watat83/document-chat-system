/** The embedding pipeline accepts database documents and browser projections. */
export interface EmbeddingDocument {
  id: string;
  organizationId: string;
  name: string;
  documentType: string;
  tags: string[];
  extractedText: string | null;
  summary: string | null;
  content: unknown;
  processing?: unknown;
  embeddings: unknown;
  entities?: unknown;
}
