/**
 * Example usage of file upload capabilities with CleanOpenRouterAdapter
 *
 * This file demonstrates how to use the enhanced file upload functionality
 * for both images and PDFs in government contracting scenarios.
 *
 * Based on OpenRouter documentation: https://openrouter.ai/docs/features/images-and-pdfs
 */

import { CleanOpenRouterAdapter } from '../providers/clean-openrouter-adapter';
import { UnifiedCompletionRequest } from '../interfaces';

// Example configuration
const config = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  appName: 'Document Chat System',
  siteUrl: 'https://document-chat-system.vercel.app',
  enableSmartRouting: true,
  costOptimization: 'balanced' as const,
  maxRetries: 3,
  timeout: 30000
};

/**
 * Example 1: Image Upload Analysis
 * Analyze an uploaded image (e.g., construction site photo)
 */
export async function analyzeUploadedImage(file: File): Promise<string> {
  // Validate file
  const validation = CleanOpenRouterAdapter.validateFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Convert to base64
  const base64Data = await CleanOpenRouterAdapter.fileToBase64(file);

  const adapter = new CleanOpenRouterAdapter(config);
  await adapter.initialize();

  // Create vision message with uploaded image
  const visionMessage = CleanOpenRouterAdapter.createVisionMessageWithData(
    "Analyze this construction site image for safety compliance, progress status, and any concerns for government contract requirements.",
    base64Data,
    file.type,
    'high' // High detail for detailed analysis
  );

  const request: UnifiedCompletionRequest = {
    model: 'openai/gpt-4o',
    messages: [visionMessage],
    temperature: 0.1,
    maxTokens: 1500,
  };

  const response = await adapter.generateCompletion(request);
  return response.content;
}

/**
 * Example 2: PDF Upload Analysis with Engine Selection
 * Analyze an uploaded PDF document with appropriate engine selection
 */
export async function analyzeUploadedPDF(
  file: File,
  isScanned: boolean = false,
  hasComplexLayout: boolean = false
): Promise<string> {
  // Validate file
  const validation = CleanOpenRouterAdapter.validateFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Get recommended engine based on document characteristics
  const engine = CleanOpenRouterAdapter.getRecommendedPDFEngine(
    isScanned,
    hasComplexLayout,
    'balanced'
  );

  // Convert to base64
  const base64Data = await CleanOpenRouterAdapter.fileToBase64(file);

  const adapter = new CleanOpenRouterAdapter(config);
  await adapter.initialize();

  // Create PDF message with appropriate engine
  const pdfMessage = CleanOpenRouterAdapter.createPDFMessageWithData(
    "Analyze this government contract document. Extract key information including contract value, requirements, deadlines, compliance requirements, and provide a structured summary.",
    base64Data,
    engine
  );

  const request: UnifiedCompletionRequest = {
    model: 'anthropic/claude-3.5-sonnet',
    messages: [pdfMessage],
    temperature: 0.1,
    maxTokens: 2000,
    hints: {
      taskType: 'document_analysis',
      complexity: 'high',
      qualityRequirement: 'premium'
    }
  };

  const response = await adapter.generateCompletion(request);
  return response.content;
}

/**
 * Example 3: Multi-Modal Analysis (Image + PDF)
 * Analyze both an image and PDF together
 */
export async function analyzeMultipleFiles(
  imageFile: File,
  pdfFile: File
): Promise<string> {
  // Validate both files
  const imageValidation = CleanOpenRouterAdapter.validateFile(imageFile);
  const pdfValidation = CleanOpenRouterAdapter.validateFile(pdfFile);

  if (!imageValidation.isValid) {
    throw new Error(`Image validation failed: ${imageValidation.error}`);
  }

  if (!pdfValidation.isValid) {
    throw new Error(`PDF validation failed: ${pdfValidation.error}`);
  }

  // Convert files to base64
  const imageBase64 = await CleanOpenRouterAdapter.fileToBase64(imageFile);
  const pdfBase64 = await CleanOpenRouterAdapter.fileToBase64(pdfFile);

  const adapter = new CleanOpenRouterAdapter(config);
  await adapter.initialize();

  // Create multi-modal message
  const multiModalMessage = CleanOpenRouterAdapter.createMultiModalMessage(
    "Compare this construction site image with the project specifications in the PDF. Identify any discrepancies, compliance issues, or progress concerns.",
    [
      {
        type: 'image',
        data: imageBase64,
        mimeType: imageFile.type,
        detail: 'high'
      },
      {
        type: 'file',

        file: {
          data: pdfBase64,
          mediaType: 'application/pdf',
          metadata: { engine: 'pdf-text' }
        }
      }
    ]
  );

  const request: UnifiedCompletionRequest = {
    model: 'openai/gpt-4o',
    messages: [multiModalMessage],
    temperature: 0.1,
    maxTokens: 2500,
    hints: {
      taskType: 'document_analysis',
      complexity: 'high',
      qualityRequirement: 'premium'
    }
  };

  const response = await adapter.generateCompletion(request);
  return response.content;
}

/**
 * Example 4: Cost Estimation Before Processing
 * Estimate costs before processing files
 */
export async function estimateFileProcessingCost(
  files: File[]
): Promise<void> {
  const adapter = new CleanOpenRouterAdapter(config);
  await adapter.initialize();

  // Create attachments from files
  const attachments = await Promise.all(
    files.map(async (file) => {
      const base64Data = await CleanOpenRouterAdapter.fileToBase64(file);

      if (file.type.startsWith('image/')) {
        return {
          type: 'image' as const,
          data: base64Data,
          mimeType: file.type,
          detail: 'auto' as const
        };
      } else if (file.type === 'application/pdf') {
        return {
          type: 'file' as const,
          data: base64Data,
          mimeType: file.type,
          metadata: {
            engine: 'pdf-text',
            pageCount: 10 // Estimate - could be calculated from file
          }
        };
      }
      throw new Error(`Unsupported file type: ${file.type}`);
    })
  );

  const message = CleanOpenRouterAdapter.createMultiModalMessage(
    "Analyze these files for compliance issues.",
    attachments
  );

  const request: UnifiedCompletionRequest = {
    model: 'openai/gpt-4o',
    messages: [message],
    temperature: 0.1,
    maxTokens: 1500,
  };

  const costEstimate = await adapter.estimateCost(request);

  console.log('File Processing Cost Estimate:');
  console.log(`- Total Cost: $${costEstimate.estimatedCost.toFixed(4)}`);
  console.log(`- Text Processing: $${costEstimate.breakdown.promptCost?.toFixed(4) || 0}`);
  console.log(`- Image Processing: $${costEstimate.breakdown.imageCost?.toFixed(4) || 0}`);
  console.log(`- PDF Processing: $${costEstimate.breakdown.pdfCost?.toFixed(4) || 0}`);
  console.log(`- Files: ${files.length} (${costEstimate.metadata?.imageCount || 0} images, ${costEstimate.metadata?.pdfPageCount || 0} PDF pages)`);
}

/**
 * Example 5: Batch File Processing
 * Process multiple files efficiently
 */
export async function batchProcessFiles(
  files: File[],
  analysisPrompt: string
): Promise<string[]> {
  const adapter = new CleanOpenRouterAdapter(config);
  await adapter.initialize();

  const results: string[] = [];

  for (const file of files) {
    try {
      let result: string;

      if (file.type.startsWith('image/')) {
        result = await analyzeUploadedImage(file);
      } else if (file.type === 'application/pdf') {
        result = await analyzeUploadedPDF(file);
      } else {
        throw new Error(`Unsupported file type: ${file.type}`);
      }

      results.push(result);

      // Add delay between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
      results.push(`Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Example 6: Model Capability Check
 * Check if selected model supports the required capabilities
 */
export function checkModelCapabilities(
  modelId: string,
  hasImages: boolean,
  hasPDFs: boolean
): { supported: boolean; message: string } {
  const supportsVision = CleanOpenRouterAdapter.isVisionModel(modelId);
  const supportsPDF = CleanOpenRouterAdapter.isPDFModel(modelId);

  if (hasImages && !supportsVision) {
    return {
      supported: false,
      message: `Model ${modelId} does not support image analysis. Please select a vision-enabled model.`
    };
  }

  if (hasPDFs && !supportsPDF) {
    return {
      supported: false,
      message: `Model ${modelId} does not support PDF processing. Please select a PDF-capable model.`
    };
  }

  return {
    supported: true,
    message: `Model ${modelId} supports all required capabilities.`
  };
}

/**
 * Example 7: Real-World Government Contract Analysis
 * Complete workflow for analyzing government contract documents
 */
export async function analyzeGovernmentContract(
  contractPDF: File,
  sitePhotos: File[],
  specifications: File[]
): Promise<{
  contractAnalysis: string;
  siteCompliance: string[];
  specificationReview: string[];
  costEstimate: number;
}> {
  const adapter = new CleanOpenRouterAdapter(config);
  await adapter.initialize();

  // 1. Analyze main contract PDF
  const contractAnalysis = await analyzeUploadedPDF(contractPDF, false, true);

  // 2. Analyze site photos for compliance
  const siteCompliance = await Promise.all(
    sitePhotos.map(photo => analyzeUploadedImage(photo))
  );

  // 3. Review specification documents
  const specificationReview = await Promise.all(
    specifications.map(spec => analyzeUploadedPDF(spec, false, false))
  );

  // 4. Calculate total cost
  const allFiles = [contractPDF, ...sitePhotos, ...specifications];
  const totalCost = await Promise.all(
    allFiles.map(async (file) => {
      const base64Data = await CleanOpenRouterAdapter.fileToBase64(file);

      const attachment = file.type.startsWith('image/')
        ? {
            type: 'image' as const,
            data: base64Data,
            mimeType: file.type,
            detail: 'auto' as const
          }
        : {
            type: 'file' as const,
            data: base64Data,
            mimeType: file.type,
            metadata: { engine: 'pdf-text', pageCount: 10 }
          };

      const message = CleanOpenRouterAdapter.createMultiModalMessage(
        "Analyze this file.",
        [attachment]
      );

      const request: UnifiedCompletionRequest = {
        model: 'openai/gpt-4o',
        messages: [message],
        temperature: 0.1,
        maxTokens: 1000
      };

      const estimate = await adapter.estimateCost(request);
      return estimate.estimatedCost;
    })
  );

  const costEstimate = totalCost.reduce((sum, cost) => sum + cost, 0);

  return {
    contractAnalysis,
    siteCompliance,
    specificationReview,
    costEstimate
  };
}

/**
 * Utility function to get file info for debugging
 */
export function getFileInfo(file: File): {
  name: string;
  size: string;
  type: string;
  isSupported: boolean;
  recommendedEngine?: string;
} {
  const validation = CleanOpenRouterAdapter.validateFile(file);

  return {
    name: file.name,
    size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    type: file.type,
    isSupported: validation.isValid,
    recommendedEngine: file.type === 'application/pdf'
      ? CleanOpenRouterAdapter.getRecommendedPDFEngine(false, false, 'balanced')
      : undefined
  };
}
