import { z } from 'zod/v3';
import { DocumentType, EntityType } from '@/types/documents';

const entity = z.object({
  id: z.string().optional(),
  type: z.nativeEnum(EntityType),
  text: z.string().max(10000).optional(),
  value: z.string().max(10000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
}).passthrough().refine(item => item.text !== undefined || item.value !== undefined, 'Entity text is required');

/** Validate editable fields without stripping extraction metadata from JSON sections. */
export const DocumentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().min(1).nullable().optional(),
  tags: z.array(z.string().trim().max(100)).max(100).optional(),
  documentType: z.nativeEnum(DocumentType).optional(),
  description: z.string().max(10000).nullable().optional(),
  content: z.object({
    sections: z.array(z.object({
      id: z.string().optional(),
      title: z.string().max(1000),
      content: z.string().max(2000000),
    }).passthrough()).max(10000).optional(),
  }).passthrough().optional(),
  analysis: z.record(z.unknown()).optional(),
  contractAnalysis: z.record(z.unknown()).optional(),
  entities: z.union([z.array(entity).max(10000), z.object({ entities: z.array(entity).max(10000) }).passthrough()]).optional(),
  aiData: z.record(z.unknown()).optional(),
  source: z.string().optional(),
}).strip();
