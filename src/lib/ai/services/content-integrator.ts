import { DocumentSection, DocumentTable, DocumentImage } from '@/types/documents'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);


/**
 * Service for integrating tables and images into document sections at correct positions
 */
export class ContentIntegrator {

  /**
   * Integrate tables and images into document sections based on page numbers and content context
   */
  integrateContentIntoSections(
    sections: DocumentSection[],
    tables: Partial<DocumentTable>[],
    images: Partial<DocumentImage>[]
  ): DocumentSection[] {
    console.log(`🔄 Integrating ${tables.length} tables and ${images.length} images into ${sections.length} sections`)

    const enhancedSections = sections.map(section => {
      const sectionPageNumber = section.pageNumber || 1
      let enhancedContent = section.content

      // Find tables that belong to this section (same page or adjacent pages)
      const sectionTables = tables.filter(table => {
        const tablePageNumber = table.pageNumber || 1
        return Math.abs(tablePageNumber - sectionPageNumber) <= 1 // Within 1 page
      })

      // Find images that belong to this section
      const sectionImages = images.filter(image => {
        const imagePageNumber = image.pageNumber || 1
        return Math.abs(imagePageNumber - sectionPageNumber) <= 1 // Within 1 page
      })

      // Insert tables into content based on context
      sectionTables.forEach((table, index) => {
        const tableHtml = this.generateTableHtml(table, index)
        enhancedContent = this.insertTableInContent(enhancedContent, tableHtml, table)
      })

      // Insert images into content based on context
      sectionImages.forEach((image, index) => {
        const imageHtml = this.generateImageHtml(image, index)
        enhancedContent = this.insertImageInContent(enhancedContent, imageHtml, image)
      })

      return {
        ...section,
        content: enhancedContent
      }
    })

    console.log(`✅ Content integration complete`)
    return enhancedSections
  }

  /**
   * Generate HTML for a table
   */
  private generateTableHtml(table: Partial<DocumentTable>, index: number): string {
    if (!table.headers || !table.rows) {
      return ''
    }

    const caption = table.caption || `Table ${index + 1}`
    const tableId = table.id || `table-${index}`

    return `
      <div class="table-container" id="${escapeHtml(tableId)}" style="margin: 20px 0;">
        <h4 style="margin-bottom: 10px; font-weight: 600;">${escapeHtml(caption)}</h4>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb;">
          <thead>
            <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              ${table.headers.map(header =>
                `<th style="padding: 12px; text-align: left; font-weight: 600; border-right: 1px solid #e5e7eb;">${escapeHtml(header)}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${table.rows.map((row, rowIndex) => `
              <tr style="border-bottom: 1px solid #e5e7eb; ${rowIndex % 2 === 1 ? 'background-color: #f9fafb;' : ''}">
                ${row.map(cell =>
                  `<td style="padding: 12px; border-right: 1px solid #e5e7eb;">${escapeHtml(cell)}</td>`
                ).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  /**
   * Generate HTML for an image
   */
  private generateImageHtml(image: Partial<DocumentImage>, index: number): string {
    const imageId = image.id || `image-${index}`
    const source = image.extractedData?.base64 ?? '';
    const base64Data = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(source) ? source : ''
    const description = image.description || `Image ${index + 1}`
    const altText = image.altText || description

    if (!base64Data) {
      return `<div class="image-placeholder" style="margin: 20px 0; padding: 20px; border: 2px dashed #d1d5db; text-align: center; color: #6b7280;">
        <p>📷 ${escapeHtml(description)}</p>
        <p><em>Image data not available</em></p>
      </div>`
    }

    return `
      <div class="image-container" id="${escapeHtml(imageId)}" style="margin: 20px 0; text-align: center;">
        <img
          src="${base64Data}"
          alt="${escapeHtml(altText)}"
          style="max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"
          loading="lazy"
        />
        <p style="margin-top: 8px; font-size: 14px; color: #6b7280; font-style: italic;">${escapeHtml(description)}</p>
      </div>
    `
  }

  /**
   * Insert table HTML into content at appropriate position
   */
  private insertTableInContent(content: string, tableHtml: string, table: Partial<DocumentTable>): string {
    // Strategy 1: Look for table-related keywords and insert nearby
    const tableKeywords = [
      'table', 'data', 'results', 'summary', 'breakdown', 'analysis',
      'schedule', 'timeline', 'budget', 'pricing', 'costs', 'rates'
    ]

    const paragraphs = content.split(/\n\s*\n/)
    let insertIndex = -1

    // Find the best paragraph to insert the table after
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].toLowerCase()

      // Check if paragraph mentions table-related concepts
      if (tableKeywords.some(keyword => paragraph.includes(keyword))) {
        insertIndex = i + 1 // Insert after this paragraph
        break
      }
    }

    // If no specific context found, insert at the end of the section
    if (insertIndex === -1) {
      insertIndex = Math.max(1, Math.floor(paragraphs.length * 0.6)) // Insert at 60% through
    }

    // Insert the table
    paragraphs.splice(insertIndex, 0, tableHtml)

    return paragraphs.join('\n\n')
  }

  /**
   * Insert image HTML into content at appropriate position
   */
  private insertImageInContent(content: string, imageHtml: string, image: Partial<DocumentImage>): string {
    // Strategy: Insert images based on content context and type
    const paragraphs = content.split(/\n\s*\n/)
    let insertIndex = -1

    const imageType = image.imageType || 'unknown'

    if (imageType === 'page_capture') {
      // For page captures, insert at strategic positions
      const contextKeywords = [
        'figure', 'diagram', 'chart', 'graph', 'illustration', 'visual',
        'see', 'shown', 'depicted', 'displayed', 'example', 'reference'
      ]

      // Find paragraph that references visual content
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].toLowerCase()

        if (contextKeywords.some(keyword => paragraph.includes(keyword))) {
          insertIndex = i + 1 // Insert after this paragraph
          break
        }
      }
    }

    // If no specific context found, insert at a reasonable position
    if (insertIndex === -1) {
      insertIndex = Math.max(1, Math.floor(paragraphs.length * 0.4)) // Insert at 40% through
    }

    // Insert the image
    paragraphs.splice(insertIndex, 0, imageHtml)

    return paragraphs.join('\n\n')
  }

  /**
   * Sort tables and images by their order within the document
   */
  sortContentByOrder<T extends { pageNumber?: number; imageOrder?: number; tableOrder?: number }>(
    items: T[]
  ): T[] {
    return items.sort((a, b) => {
      // Sort by page number first
      const pageA = a.pageNumber || 0
      const pageB = b.pageNumber || 0
      if (pageA !== pageB) {
        return pageA - pageB
      }

      // Then by specific order (imageOrder or tableOrder)
      const orderA = (a as any).imageOrder || (a as any).tableOrder || 0
      const orderB = (b as any).imageOrder || (b as any).tableOrder || 0
      return orderA - orderB
    })
  }
}

export const contentIntegrator = new ContentIntegrator()
