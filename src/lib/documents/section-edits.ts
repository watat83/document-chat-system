import type { DocumentContent } from '@/types/documents';

/** Apply UI section edits while preserving persisted IDs and extraction metadata. */
export function applySectionEdits(
  sections: DocumentContent['sections'],
  edits: Record<string, string>,
): DocumentContent['sections'] {
  return sections.map(section => {
    const content = edits[section.id];
    return content === undefined ? section : { ...section, content };
  });
}
