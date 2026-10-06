'use client';

import { useConversationHistory } from '@/hooks/use-conversation-history';
import { readSSEData } from '@/lib/ai/sse-reader';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth, SignInButton } from '@clerk/nextjs';
import { useNotify } from '@/contexts/notification-context';
import { useAI, useAIModels, useAIFeatures } from '@/stores/document-chat-store';
import { useImageRouterStore } from '@/stores/imagerouter-store';
import { validateFile, createCorrectedFile } from '@/lib/file-validation';
import { ai as aiConfig } from '@/lib/config/env';
import { hybridFileProcessor } from '@/lib/file-processing/hybrid-processor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnhancedMessageRenderer } from '@/components/chat/enhanced-message-renderer';
import { MessageActions } from '@/components/chat/message-actions';
import { ModelSelectionModal } from '@/components/ai/model-selection-modal';
import { getDefaultProvider, getUIProviders } from '@/lib/ai/admin/provider-management';
import { 
  Sparkles,
  Send,
  Upload,
  FileText,
  Copy,
  BarChart3,
  X,
  Wand2,
  Github,
  Folder,
  Target,
  CheckSquare,
  PenTool,
  Search,
  Zap,
  ChevronRight,
  Paperclip,
  Loader2,
  CheckCircle,
} from 'lucide-react';

import { ChatState } from '@/types/chat';

// Utility function to ensure content is always a string
const ensureStringContent = (content: any): string => {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (Array.isArray(content)) {
    return content.map(ensureStringContent).join('');
  }
  if (typeof content === 'object') {
    // If it's a React element or complex object, stringify it
    try {
      return JSON.stringify(content, null, 2);
    } catch (e) {
      return String(content);
    }
  }
  return String(content);
};

interface CleanAIChatProps {
  organizationId: string;
  className?: string;
  onCitationsUpdate?: (citations: Citation[]) => void;
  chatState?: ChatState; // NEW - optional chat state
}

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  content?: string;
  processing?: boolean;
  url?: string;
  file?: File;
  base64?: string;
  annotations?: any; // Store file annotations for cost optimization
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  file?: File;
  base64?: string;
  annotations?: any; // Store file annotations for cost optimization
  // File processing fields
  processedText?: string;     // Extracted text content
  isProcessed?: boolean;      // Processing status
  processingError?: string;   // Error message if processing failed
  processingMethod?: string;  // How the file was processed
}

interface Citation {
  url: string;
  title?: string;
  content?: string;
  start_index: number;
  end_index: number;
  type?: 'web' | 'file'; // Add type to distinguish file vs web citations
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachedFiles?: AttachedFile[];
  metadata?: {
    model?: string;
    provider?: string;
    cost?: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    citations?: Citation[];
    annotations?: any[];
  };
}

interface AIProvider {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  models: AIModel[];
  priority: number;
  costPerPromptToken: number;
  costPerCompletionToken: number;
  maxTokens: number;
  rateLimitPerMinute: number;
  features: string[];
  description: string;
}

interface AIModel {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
  costPerPromptToken: number;
  costPerCompletionToken: number;
  features: string[];
  provider: string;
  tier: 'fast' | 'balanced' | 'powerful';
  quality: number;
  speed: number;
  cost: number;
}

interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  template: string;
  category: string;
}

const contentTemplates: ContentTemplate[] = [
  {
    id: 'proposal-review',
    name: 'Proposal Review',
    description: 'Review and improve proposal content',
    icon: FileText,
    template: "Please review this proposal and provide feedback on:\n1. Technical approach\n2. Risk management\n3. Cost structure\n4. Compliance requirements\n\n[Paste your proposal content here]",
    category: 'Government'
  },
  {
    id: 'naics-analysis',
    name: 'NAICS Analysis',
    description: 'Analyze NAICS code alignment',
    icon: Target,
    template: "Please analyze the NAICS code alignment for this opportunity:\n\nOpportunity: [Description]\nRequired NAICS: [Code]\nMy NAICS: [Code]\n\nProvide assessment of eligibility and recommendations.",
    category: 'Analysis'
  },
  {
    id: 'compliance-check',
    name: 'Compliance Check',
    description: 'Check regulatory compliance',
    icon: CheckSquare,
    template: "Please perform a compliance check for this requirement:\n\nRegulation: [FAR/DFARS/etc.]\nRequirement: [Description]\nMy approach: [Description]\n\nIdentify any compliance gaps and provide recommendations.",
    category: 'Compliance'
  },
  {
    id: 'technical-writing',
    name: 'Technical Writing',
    description: 'Draft technical documentation',
    icon: PenTool,
    template: "Please help me draft technical documentation for:\n\nTopic: [Description]\nAudience: [Government/Technical/Management]\nKey points to cover:\n- [Point 1]\n- [Point 2]\n- [Point 3]",
    category: 'Writing'
  }
];

export function CleanAIChat({ organizationId, className, onCitationsUpdate, chatState }: CleanAIChatProps) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { success: notifySuccess, error: notifyError, warning: notifyWarning, info: notifyInfo } = useNotify();
  const [isMounted, setIsMounted] = useState(false);

  // Zustand store hooks
  const ai = useAI();
  const models = useAIModels();
  const features = useAIFeatures();
  const imageRouter = useImageRouterStore();
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const history = useConversationHistory(userId, organizationId, messages, setMessages);
  const requestAbort = useRef<AbortController | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  
  // Compute overall loading state including AI models loading
  const isInputDisabled = useMemo(() => {
    return isLoading || ai.loading || models.length === 0 || (!history.ready && !history.error);
  }, [isLoading, ai.loading, models.length, history.ready, history.error]);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  
  // Image generation mode toggle
  const [imageGenerationMode, setImageGenerationMode] = useState(false);

  // Citations state for callback
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);

  // Textarea ref for auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // AI integration state
  const [hasUsageQuota, setHasUsageQuota] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  
  // File handling
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // UI state
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [activeToolsTab, setActiveToolsTab] = useState<'tools' | 'files' | 'apps'>('tools');
  const [markdownMode, setMarkdownMode] = useState(true);
  
  // Model selection modal state
  const [modalMode, setModalMode] = useState<'text' | 'media'>('text');

  // AI settings derived from Zustand store
  const selectedModel = ai.selectedModel || 'openai/gpt-4o-mini';

  // Initialize mounted state and default text model
  useEffect(() => {
    setIsMounted(true);

    // Ensure we start with a text generation model, not an image model
    if (!ai.selectedModel || ai.selectedModel.includes('test/test') || ai.selectedModel.includes('ir/')) {
      ai.setSelectedModel('openai/gpt-4o-mini');
    }
  }, []);

  // Initialize with appropriate welcome message based on chat state
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage = getWelcomeMessage(chatState);
      setMessages([welcomeMessage]);
    }
  }, [chatState?.documentChatEnabled]);

  // Helper function to get welcome message
  const getWelcomeMessage = (state?: ChatState): ChatMessage => {
    if (state?.documentChatEnabled) {
      const scope = state.documentScope!;
      let contextText = '';
      
      switch (scope.mode) {
        case 'all-documents':
          contextText = `I can help you search and analyze all ${scope.documentCount || 0} documents in your account.`;
          break;
        case 'current-folder':
          contextText = `I'm focused on documents in the "${scope.folderName}" folder.`;
          break;
        case 'selected-documents':
          contextText = `I'm analyzing your ${scope.documentIds?.length || 0} selected documents.`;
          break;
      }
      
      return {
        id: 'welcome-doc',
        role: 'assistant',
        content: `🔍 **Document Chat Enabled**\n\n${contextText}\n\nYou can ask me about:\n• Document requirements and specifications\n• Deadlines and timelines\n• Contract terms and conditions\n• NAICS codes and classifications\n• Any specific content in your documents`,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        id: 'welcome-general',
        role: 'assistant', 
        content: `👋 **Welcome to AI Assistant**\n\nI'm here to help with your questions, provide insights, and assist with any topics you'd like to discuss.\n\n💡 *Tip: Enable "Document Chat" in the floating chat window to search and analyze your uploaded documents.*`,
        timestamp: new Date().toISOString()
      };
    }
  };
  const [currentlyUsedModel, setCurrentlyUsedModel] = useState<string | null>(null);
  
  // Check API configuration on mount
  useEffect(() => {
    const checkAPIConfiguration = async () => {
      try {
        const response = await fetch('/api/v1/ai/health');
        
        if (response.ok) {
          const data = await response.json();
          
          // Check if we have any configured providers
          const hasConfiguredProviders = data.providers?.configured?.length > 0;
          const hasValidConfig = data.system?.validation?.isValid || false;
          
          setApiKeyConfigured(hasConfiguredProviders && hasValidConfig);
          
          // Optional: Notify user of system status
          if (hasConfiguredProviders && hasValidConfig) {
            console.log('AI system ready: All providers configured');
          } else {
            console.log('Configure API keys for full functionality');
          }
        } else {
          console.warn('API health check failed:', response.status);
          setApiKeyConfigured(false);
        }
      } catch (error) {
        console.error('💥 Error checking API configuration:', error);
        setApiKeyConfigured(false);
      }
    };

    checkAPIConfiguration();
  }, [notifySuccess, notifyInfo, notifyWarning, notifyError]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);


  // Get dynamic providers from management system
  const dynamicProviders = useMemo(() => {
    try {
      return getUIProviders();
    } catch (error) {
      console.warn('Failed to get dynamic providers, using fallback:', error);
      return [];
    }
  }, []);

  // Initialize AI models if not already loaded (wait for auth to be ready)
  useEffect(() => {
    // Wait for auth to be loaded before fetching models
    if (isLoaded && isSignedIn && models.length === 0 && !ai.loading) {
      console.log('🔄 Auto-loading AI models after auth ready...');
      // Small delay to ensure auth cookie is propagated
      const timer = setTimeout(() => {
        ai.refreshModels();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isSignedIn, models.length, ai.loading]); // Depend on auth state
  
  // Initialize ImageRouter models if not already loaded (optional feature)
  useEffect(() => {
    const loadImageRouterModels = async () => {
      if (imageRouter.models.length === 0 && !imageRouter.isLoading) {
        console.log('🎨 Loading ImageRouter models...');
        try {
          imageRouter.actions.setLoading(true);
          
          // Fetch ImageRouter models from the API with authentication
          const response = await fetch('/api/v1/ai/providers/imagerouter/models', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include', // Include cookies for authentication
          });
          
          if (response.ok) {
            const models = await response.json();
            imageRouter.actions.setModels(models);
            console.log('✅ ImageRouter models loaded:', models.length);
          } else {
            console.warn('⚠️ Failed to load ImageRouter models:', response.status, response.statusText);
            // Log response text for debugging
            try {
              const errorText = await response.text();
              console.warn('⚠️ ImageRouter error response:', errorText);
            } catch (e) {
              console.warn('⚠️ Could not read error response');
            }
            
            // Set empty models array to prevent further attempts
            imageRouter.actions.setModels([]);
          }
        } catch (error) {
          console.error('❌ Error loading ImageRouter models:', error);
          // The error is likely a network issue, auth issue, or the API endpoint is down
          // Since the API has fallback models, this shouldn't break the UI
          console.log('⚠️ ImageRouter models will be unavailable, but the chat will still work');
          
          // Set empty models array to prevent retries and stop the error loop
          imageRouter.actions.setModels([]);
        } finally {
          imageRouter.actions.setLoading(false);
        }
      }
    };
    
    // Only attempt to load ImageRouter models once per session
    // If it fails, we set an empty array to prevent retries
    loadImageRouterModels();
  }, []); // Empty dependency array to run only once

  // Convert Zustand models to legacy format for backward compatibility
  const providers: AIProvider[] = useMemo(() => {
    const providerMap = new Map<string, AIProvider>();

    // Always include OpenRouter provider (even if models aren't loaded yet)
    providerMap.set('openrouter', {
      id: 'openrouter',
      name: 'OpenRouter',
      status: 'active',
      models: [],
      priority: 1,
      costPerPromptToken: 0.00015,
      costPerCompletionToken: 0.0006,
      maxTokens: 200000,
      rateLimitPerMinute: 500,
      features: ['chat', 'completion'],
      description: 'OpenRouter provider with 100+ models'
    });

    // Always include ImageRouter provider (even if models aren't loaded yet)
    providerMap.set('imagerouter', {
      id: 'imagerouter',
      name: 'ImageRouter',
      status: 'active',
      models: [],
      priority: 2,
      costPerPromptToken: 0.0002,
      costPerCompletionToken: 0.0008,
      maxTokens: 4000,
      rateLimitPerMinute: 30,
      features: ['image-generation', 'video-generation'],
      description: 'ImageRouter provider for AI image and video generation'
    });

    // Add models to OpenRouter provider from Zustand store
    if (models.length > 0) {
      models.forEach(model => {
        const providerId = model.provider || (model.name.includes('/') ? model.name.split('/')[0] : 'openrouter');

        // Get or create provider
        if (!providerMap.has(providerId)) {
          providerMap.set(providerId, {
            id: providerId,
            name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
            status: 'active',
            models: [],
            priority: 3,
            costPerPromptToken: 0.00015,
            costPerCompletionToken: 0.0006,
            maxTokens: 128000,
            rateLimitPerMinute: 500,
            features: ['chat', 'completion'],
            description: `${providerId} provider`
          });
        }

        const provider = providerMap.get(providerId)!;
        provider.models.push({
          id: model.name,
          name: model.displayName || model.name,
          description: model.description || `${model.name} via ${provider.name}`,
          maxTokens: model.maxTokens || 128000,
          costPerPromptToken: model.costPer1KTokens?.prompt / 1000 || 0.00015,
          costPerCompletionToken: model.costPer1KTokens?.completion / 1000 || 0.0006,
          features: model.features || ['reasoning', 'code'],
          provider: providerId,
          tier: model.tier || 'balanced',
          quality: model.qualityScore || 85,
          speed: model.averageLatency ? Math.max(100 - model.averageLatency / 10, 10) : 90,
          cost: model.costPer1KTokens ? (model.costPer1KTokens.prompt + model.costPer1KTokens.completion) / 10 : 20
        });
      });
    }

    // Add ImageRouter models if available
    if (imageRouter.models.length > 0) {
      const imageRouterProvider = providerMap.get('imagerouter')!;
      imageRouter.models.forEach((model: any) => {
        imageRouterProvider.models.push({
          id: model.id || model.name,
          name: model.name || model.displayName,
          description: model.description || `${model.name} via ImageRouter`,
          maxTokens: 4000,
          costPerPromptToken: 0.0002,
          costPerCompletionToken: 0.0008,
          features: model.features || ['image-generation'],
          provider: 'imagerouter',
          tier: 'balanced',
          quality: 85,
          speed: 80,
          cost: 30
        });
      });
    }

    // If no models loaded for OpenRouter, add fallback models
    const openRouterProvider = providerMap.get('openrouter')!;
    if (openRouterProvider.models.length === 0) {
      openRouterProvider.models = [
        {
          id: 'openai/gpt-4o-mini',
          name: 'GPT-4o Mini (OpenRouter)',
          description: 'Fast and efficient via OpenRouter - Best value',
          maxTokens: 128000,
          costPerPromptToken: 0.00015,
          costPerCompletionToken: 0.0006,
          features: ['reasoning', 'code', 'math'],
          provider: 'openrouter',
          tier: 'balanced',
          quality: 85,
          speed: 90,
          cost: 20
        }
      ];
    }

    // If no models loaded for ImageRouter, add fallback models
    const imageRouterProvider = providerMap.get('imagerouter')!;
    if (imageRouterProvider.models.length === 0) {
      imageRouterProvider.models = [
        {
          id: 'test/test',
          name: 'Test Image Model',
          description: 'AI image generation via ImageRouter',
          maxTokens: 4000,
          costPerPromptToken: 0.0002,
          costPerCompletionToken: 0.0008,
          features: ['image-generation'],
          provider: 'imagerouter',
          tier: 'balanced',
          quality: 85,
          speed: 80,
          cost: 30
        }
      ];
    }

    return Array.from(providerMap.values());
  }, [models, imageRouter.models]);

  // Dynamically determine provider based on selected model (must be after providers)
  const selectedProvider = useMemo(() => {
    if (!selectedModel) return getDefaultProvider(organizationId);

    // Find which provider has this model
    const providerWithModel = providers.find(p =>
      p.models.some(m => m.id === selectedModel || m.name === selectedModel)
    );

    return providerWithModel?.id || getDefaultProvider(organizationId);
  }, [selectedModel, providers, organizationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingMessage]);
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to get the correct scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set the height to the scrollHeight
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  // File handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleScroll = (e: React.UIEvent) => {
    // Handle scroll events if needed
  };

  // Preprocess message to convert media URLs to markdown format
  const preprocessMessage = (content: string): string => {
    // Media URL patterns
    const mediaUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|mp4|mov|avi|mkv|wmv|flv|webm|m4v|3gp|ogv|mp3|wav|flac|aac|ogg|wma|m4a|opus|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|odt|ods|odp|zip|rar|7z|tar|gz|bz2)(\?[^\s]*)?/gi;
    
    // Convert plain media URLs to markdown format for better rendering
    return content.replace(mediaUrlPattern, (url) => {
      // Don't convert if it's already in markdown format
      if (content.includes(`![`) && content.includes(`](${url})`) || 
          content.includes(`[`) && content.includes(`](${url})`)) {
        return url;
      }
      
      // Extract filename for alt text
      const filename = url.split('/').pop()?.split('?')[0] || 'file';
      
      // For images, use markdown image syntax
      if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)(\?[^\s]*)?$/i.test(url)) {
        return `![${filename}](${url})`;
      }
      
      // For other media, use link syntax (will be handled by UniversalMessageRenderer)
      return `[${filename}](${url})`;
    });
  };

  // Simple web search detection
  const needsWebSearch = (content: string): boolean => {
    const input = content.toLowerCase().trim();
    // Enhanced detection for web search, videos, and images
    return /\b(search|find|lookup|current|latest|recent|today|news|what.*happening|tell.*about.*current|show.*video|find.*video|youtube|video.*of|image.*of|picture.*of|photo.*of)\b/i.test(input);
  };

  // Handle image generation toggle with automatic model switching
  const handleImageGenerationToggle = async () => {
    const newImageMode = !imageGenerationMode;
    setImageGenerationMode(newImageMode);

    if (newImageMode) {
      // Toggle ON: Disable OpenRouter and enable ImageRouter
      console.log('🎨 Image mode toggle ON - disabling OpenRouter, enabling ImageRouter');
      // Silently disable OpenRouter without triggering its handler
      if (features.openRouterEnabled) {
        ai.toggleFeature('openRouterEnabled', false);
      }

      console.log('📊 Current providers:', providers.map(p => ({ id: p.id, models: p.models.length })));

      const imageProvider = providers.find(p => p.id === 'imagerouter');
      if (imageProvider && imageProvider.models.length > 0) {
        const firstImageModel = imageProvider.models[0];
        console.log('✅ Found ImageRouter provider, auto-selecting model:', {
          provider: 'imagerouter',
          id: firstImageModel.id,
          name: firstImageModel.name,
          usingField: firstImageModel.id || firstImageModel.name
        });
        // Use id if available, fallback to name (to match store behavior)
        const modelToSet = firstImageModel.id || firstImageModel.name;
        ai.setSelectedModel(modelToSet);

        // Force a small delay to ensure store is updated
        setTimeout(() => {
          console.log('🔄 Verifying model selection:', {
            requested: modelToSet,
            current: ai.selectedModel,
            success: ai.selectedModel === modelToSet
          });
        }, 100);
      } else {
        console.warn('⚠️ ImageRouter provider not found or no models. Attempting to load...');

        // Try to load ImageRouter models if not available
        if (imageRouter.models.length === 0 && !imageRouter.isLoading) {
          try {
            console.log('🔄 Loading ImageRouter models...');
            imageRouter.actions.setLoading(true);

            const response = await fetch('/api/v1/ai/providers/imagerouter/models');
            if (response.ok) {
              const models = await response.json();
              imageRouter.actions.setModels(models);
              console.log('✅ ImageRouter models loaded, retrying selection...');

              // Retry selection after loading
              const updatedImageProvider = providers.find(p => p.id === 'imagerouter');
              if (updatedImageProvider && updatedImageProvider.models.length > 0) {
                const firstImageModel = updatedImageProvider.models[0];
                const modelToSet = firstImageModel.id || firstImageModel.name;
                console.log('✅ Auto-selecting model after load:', { id: firstImageModel.id, name: firstImageModel.name, using: modelToSet });
                ai.setSelectedModel(modelToSet);
              } else {
                console.error('❌ Still no ImageRouter models after loading');
                ai.setSelectedModel('openai/dall-e-3'); // Fallback
              }
            } else {
              console.error('❌ Failed to load ImageRouter models:', response.status);
              ai.setSelectedModel('openai/dall-e-3'); // Fallback
            }
          } catch (error) {
            console.error('❌ Error loading ImageRouter models:', error);
            ai.setSelectedModel('openai/dall-e-3'); // Fallback
          } finally {
            imageRouter.actions.setLoading(false);
          }
        } else if (imageRouter.models.length > 0) {
          // Models are loaded in imageRouter store but not in providers yet
          const fallbackModel = imageRouter.models[0];
          const modelToSet = fallbackModel.id || fallbackModel.name;
          console.log('🔄 Using first model from imageRouter store as fallback:', { id: fallbackModel.id, name: fallbackModel.name, using: modelToSet });
          ai.setSelectedModel(modelToSet);
        } else {
          console.error('❌ No ImageRouter models available, using fallback');
          ai.setSelectedModel('openai/dall-e-3'); // Final fallback
        }
      }
    } else {
      // Toggle OFF: Enable OpenRouter and disable ImageRouter, select first OpenRouter model
      console.log('💬 Image mode toggle OFF - enabling OpenRouter, selecting first model');
      if (!features.openRouterEnabled) {
        ai.toggleFeature('openRouterEnabled', true);
      }

      console.log('📊 Current providers for OFF toggle:', providers.map(p => ({ id: p.id, models: p.models.length })));

      // Find OpenRouter provider and select its first model
      const openRouterProvider = providers.find(p => p.id === 'openrouter');
      if (openRouterProvider && openRouterProvider.models.length > 0) {
        const firstOpenRouterModel = openRouterProvider.models[0];
        const modelToSet = firstOpenRouterModel.id || firstOpenRouterModel.name;
        console.log('✅ Found OpenRouter provider, selecting first model:', {
          provider: 'openrouter',
          id: firstOpenRouterModel.id,
          name: firstOpenRouterModel.name,
          using: modelToSet
        });
        ai.setSelectedModel(modelToSet);

        // Force a small delay to ensure store is updated
        setTimeout(() => {
          console.log('🔄 Verifying OFF toggle model selection:', {
            requested: modelToSet,
            current: ai.selectedModel,
            success: ai.selectedModel === modelToSet
          });
        }, 100);
      } else {
        console.warn('⚠️ OpenRouter provider not found or no models, using fallback');
        ai.setSelectedModel('openai/gpt-4o-mini'); // Fallback
      }
    }
  };

  // Message handling
  const sendMessage = async (messageContent: string) => {
    if (!messageContent.trim()) return;
    
    // Preprocess the message to convert image URLs
    const processedContent = preprocessMessage(messageContent);

    // Create attached files from documents
    const attachedFiles: AttachedFile[] = [];
    for (const doc of documents) {
      console.log('📎 Processing document for attachment:', {
        name: doc.name,
        hasContent: !!doc.content,
        contentLength: doc.content?.length || 0,
        hasAnnotations: !!doc.annotations,
        isProcessed: doc.annotations?.isProcessed,
        processedTextLength: doc.annotations?.processedText?.length || 0
      });

      const attachedFile: AttachedFile = {
        id: doc.id,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        url: doc.url,
        file: doc.file,
        base64: doc.base64,
        annotations: doc.annotations, // Include cached annotations for cost optimization
        // File processing fields - use doc.content as fallback if annotations not available
        processedText: doc.annotations?.processedText || doc.content,
        isProcessed: doc.annotations?.isProcessed || !!doc.content,
        processingError: doc.annotations?.processingError,
        processingMethod: doc.annotations?.processingMethod
      };
      attachedFiles.push(attachedFile);

      console.log('✅ Created attachedFile:', {
        name: attachedFile.name,
        isProcessed: attachedFile.isProcessed,
        processedTextLength: attachedFile.processedText?.length || 0
      });
    }

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user' as const,
      content: processedContent,
      timestamp: new Date(),
      attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Don't clear uploaded documents - keep them for follow-up questions
    // setDocuments([]);
    
    requestAbort.current = new AbortController();
    setIsThinking(true);
    setIsLoading(true);
    setIsStreaming(false);
    setStreamProgress(0);

    try {
      // Simple 3-way routing logic
      console.log('🎯 Simple routing decision:', {
        imageGenerationMode,
        hasAttachedFiles: attachedFiles.length > 0,
        needsWebSearch: needsWebSearch(processedContent),
        messageContent: processedContent.substring(0, 100)
      });

      // 1. FILE PROCESSING: Always prioritize file processing when files are attached
      if (attachedFiles.length > 0) {
        console.log('📁 Files attached, using file processing mode regardless of image toggle');
        // Force to default text processing flow for file handling
        // Skip image generation even if toggle is ON
      }
      // 2. IMAGE GENERATION: User explicitly toggled image mode AND no files attached
      else if (imageGenerationMode) {
        console.log('🎨 Image generation mode enabled, using selected image model');
        
        // Use the model that was already set by the toggle (from providers array)
        const modelToUse = selectedModel || 'openai/dall-e-3';
        
        console.log('🎨 Using selected image model:', {
          id: modelToUse,
          mode: 'image_generation'
        });
        setCurrentlyUsedModel(modelToUse);
        
        const mediaResult = await callMediaAPI(processedContent, modelToUse);
        
        // Handle the result or return early if authentication failed
        if (mediaResult === null) {
          return;
        }
        
        // If we get a result, create a message with the generated image
        if (mediaResult) {
          const assistantMessage: ChatMessage = {
            id: `assistant_${Date.now()}`,
            role: 'assistant' as const,
            content: `![Generated Image](${mediaResult.url})`,
            timestamp: new Date(),
            metadata: {
              model: mediaResult.model,
              provider: 'imagerouter',
              cost: mediaResult.cost,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
              },
              citations: [],
              annotations: [],
              generatedMedia: {
                type: 'image',
                url: mediaResult.url,
                prompt: processedContent,
                revisedPrompt: mediaResult.revised_prompt
              }
            }
          };
          
          setMessages(prev => [...prev, assistantMessage]);
        }
        
        return;
      }
      
      // 3. WEB SEARCH: Auto-detect web search needs
      let finalContent = processedContent;
      const webSearchNeeded = needsWebSearch(processedContent);

      // If web search is needed for videos, add explicit URL requirement to the query
      if (webSearchNeeded && /\b(video|youtube|show.*video|find.*video)\b/i.test(processedContent)) {
        finalContent = `${processedContent}\n\n[SYSTEM INSTRUCTION: You MUST include the actual YouTube URLs (https://www.youtube.com/watch?v=ID) in your response. Format as: ### Title followed by the URL on the next line. DO NOT just list titles!]`;
        console.log('📺 Added explicit YouTube URL requirement to query');
      }

      console.log('🔍 Web search check:', {
        needed: webSearchNeeded,
        hasAttachedFiles: attachedFiles.length > 0,
        messageContent: finalContent.substring(0, 100)
      });

      if (webSearchNeeded) {
        console.log('🔍 Web search detected, will use online model');
      }
      
      // 4. DEFAULT: Text generation with file processing
      const modelToUse = selectedModel;
      console.log('💬 Text/file processing mode, using model:', modelToUse);

      setCurrentlyUsedModel(modelToUse);
      
      
      // Switch from thinking to typing
      setIsThinking(false);
      setIsLoading(true);

      // Always use real AI
      await callRealAI(finalContent, attachedFiles, modelToUse, webSearchNeeded);
    } catch (error) {
      console.error('Error sending message:', error);
      notifyError('Error sending message. Please try again.');
    } finally {
      setIsThinking(false);
      setIsLoading(false);
      setIsStreaming(false);
      setStreamProgress(0);
      setCurrentStreamingMessage('');
      // Clear the currently used model after a short delay to show completion
      setTimeout(() => setCurrentlyUsedModel(null), 2000);
    }
  };

  // Real AI API call
  const callRealAI = async (messageContent: string, attachedFiles: AttachedFile[], modelToUse: string, needsWebSearch: boolean) => {
    try {
      console.log('🚀 callRealAI function called with:', messageContent.substring(0, 50) + '...', attachedFiles.length, 'files');
      
      // Prepare file context from processed documents (including OCR-processed images)
      const fileContextMessages = [];
      for (const processedFile of attachedFiles) {
        if (processedFile.isProcessed && processedFile.processedText) {
          fileContextMessages.push({
            role: 'system',
            content: `[Document: "${processedFile.name}" (${formatFileSize(processedFile.size)}) - Processed via ${processedFile.processingMethod}]\n${processedFile.processedText}\n[End of Document: "${processedFile.name}"]`
          });
        }
      }
      
      console.log('📄 File context messages:', fileContextMessages.length, 'processed files included');

      // Prepare messages for AI API
      const systemMessage = {
        role: 'system' as const,
        content: `You are a helpful AI assistant. You help users with their questions and tasks including:
- Analyzing and extracting information from documents
- Answering questions and providing insights
- Research and information gathering
- Content creation and analysis
- Analyzing images, documents, PDFs, and other attachments

IMPORTANT: When users upload files (PDFs, images, documents), you MUST acknowledge that you can see the attached files and analyze their content. Extract and analyze all relevant information from uploaded files. For PDFs, extract text, tables, and data. For images, describe what you see. Always reference the specific files the user has uploaded.

CRITICAL: When referencing information from uploaded files, you MUST cite the specific file name in your response. Format file references like this:
- "According to [filename.pdf], the document states..."
- "Based on the data in [document.xlsx], we can see..."
- "The image [screenshot.png] shows..."
- "As outlined in [document.docx], the key points are..."

Always include the filename in brackets when referencing uploaded content. This helps users understand which specific document contains the information you're referencing.

If a user asks you to "extract data from this file" or similar requests, it means they have uploaded a file and you should analyze it immediately. Never ask them to upload a file if they've already uploaded one.

⚠️ CRITICAL MEDIA EMBEDDING INSTRUCTIONS - READ CAREFULLY ⚠️

When users ask for videos or images, you MUST include actual URLs:

**FOR YOUTUBE VIDEOS:**

YOU HAVE WEB SEARCH ACCESS. Your search results INCLUDE actual YouTube URLs.

REQUIRED FORMAT (copy this exactly):
### [Video Title Here]
https://www.youtube.com/watch?v=[VIDEO_ID]

EXAMPLE - THIS IS CORRECT:
### Sample Video Title
https://www.youtube.com/watch?v=7TEnJ5pyFDg

### Another Video Title
https://www.youtube.com/watch?v=M6eEn5IsDxk

❌ NEVER DO THIS:
- "Here are some videos: ▶️ Title" (NO URLS = WRONG!)
- "Feel free to check them out!" (WHERE ARE THE URLS?!)
- Describing videos without actual URLs
- Using emojis without URLs

✅ ALWAYS DO THIS:
1. Search the web for videos (you have this capability)
2. Find the actual youtube.com URLs in search results
3. Copy the FULL URL including https://www.youtube.com/watch?v=VIDEO_ID
4. Format as shown above with ### heading and URL on separate line
5. Repeat for each video (3-5 videos recommended)

If you cannot find actual YouTube URLs in your search results, say: "I searched but could not retrieve embeddable YouTube URLs. Please try a different search."

DO NOT respond with just video titles. URLs are MANDATORY.

Provide accurate, helpful, and professional assistance.`
      };

      // Convert messages to API format using imperative approach
      const conversationMessages = [];
      for (const message of messages) {
        const apiMessage = {
          role: message.role,
          content: message.content,
          attachments: undefined
        };

        // Process attachments if they exist
        if (message.attachedFiles && message.attachedFiles.length > 0) {
          const attachments = [];
          for (const attachedFile of message.attachedFiles) {
            // Only include unprocessed files
            if (!attachedFile.isProcessed || !attachedFile.processedText) {
              let fileType = 'file';
              if (attachedFile.type.startsWith('image/')) {
                fileType = 'image';
              } else if (attachedFile.type === 'application/pdf') {
                fileType = 'pdf';
              }

              let fileData = attachedFile.base64;
              if (fileData && fileData.includes(',')) {
                fileData = fileData.split(',')[1];
              }

              let pdfEngine = undefined;
              if (attachedFile.type === 'application/pdf') {
                pdfEngine = 'pdf-text';
              }

              const attachment = {
                type: fileType,
                data: fileData,
                name: attachedFile.name,
                mimeType: attachedFile.type,
                size: attachedFile.size,
                detail: 'auto',
                pdfEngine: pdfEngine,
                annotations: attachedFile.annotations
              };

              attachments.push(attachment);
            }
          }

          if (attachments.length > 0) {
            apiMessage.attachments = attachments;
          }
        }

        conversationMessages.push(apiMessage);
      }

      // Process user message attachments using imperative approach
      let userAttachments = undefined;
      if (attachedFiles.length > 0) {
        const attachments = [];
        for (const fileItem of attachedFiles) {
          // Only include unprocessed files
          if (!fileItem.isProcessed || !fileItem.processedText) {
            let fileType = 'file';
            if (fileItem.type.startsWith('image/')) {
              fileType = 'image';
            } else if (fileItem.type === 'application/pdf') {
              fileType = 'pdf';
            }

            let fileData = fileItem.base64;
            if (fileData && fileData.includes(',')) {
              fileData = fileData.split(',')[1];
            }

            let pdfEngine = undefined;
            if (fileItem.type === 'application/pdf') {
              pdfEngine = 'pdf-text';
            }

            const attachment = {
              type: fileType,
              data: fileData,
              name: fileItem.name,
              mimeType: fileItem.type,
              size: fileItem.size,
              detail: 'auto',
              pdfEngine: pdfEngine,
              annotations: fileItem.annotations
            };

            attachments.push(attachment);
          }
        }

        if (attachments.length > 0) {
          userAttachments = attachments;
        }
      }

      const userMessage = {
        role: 'user' as const,
        content: messageContent,
        attachments: userAttachments
      };

      // Combine all messages
      const apiMessages = [
        systemMessage,
        ...fileContextMessages,
        ...conversationMessages,
        userMessage
      ];
      
      let requestBody = {
        messages: apiMessages,
        model: modelToUse,
        provider: selectedProvider,
        organizationId: organizationId === 'demo' ? null : organizationId,
        streamingEnabled: true,
        temperature: 0,
        maxTokens: aiConfig.maxTokens,
        useVercelOptimized: false,
        options: {
          webSearch: {
            enabled: needsWebSearch,
            max_results: 5,
            search_depth: 'basic'
          }
        }
      };
      
      console.log('🚀 Sending request to enhanced-chat:', {
        messageCount: requestBody.messages?.length,
        model: requestBody.model,
        provider: requestBody.provider,
        webSearchEnabled: requestBody.options?.webSearch?.enabled,
        hasAttachments: 'checking...'
      });
      
      // Debug image attachments
      if (requestBody.messages) {
        for (let msgIndex = 0; msgIndex < requestBody.messages.length; msgIndex++) {
          const msg = requestBody.messages[msgIndex];
          if (msg.attachments && msg.attachments.length > 0) {
            console.log(`📎 Message ${msgIndex} has ${msg.attachments.length} attachments`);
          }
        }
      }
      console.log('  - organizationId:', requestBody.organizationId);
      console.log('  - streamingEnabled:', requestBody.streamingEnabled);
      console.log('  - temperature:', requestBody.temperature);
      console.log('  - maxTokens:', requestBody.maxTokens);
      console.log('  - useVercelOptimized:', requestBody.useVercelOptimized);
      
      console.log('🌐 About to make fetch request...');
      
      // Choose the appropriate endpoint based on chat state
      const apiEndpoint = chatState?.documentChatEnabled 
        ? '/api/v1/ai/document-chat' 
        : '/api/v1/ai/enhanced-chat';
      
      // Modify request body for document chat
      if (chatState?.documentChatEnabled) {
        requestBody = {
          ...requestBody,
          documentContext: chatState.documentScope,
          useVercelOptimized: true,
          model: selectedModel.replace(/^(openai|anthropic)\//, ''),
          temperature: 0.3, // Lower temperature for factual responses
        };
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: requestAbort.current?.signal
      });
      
      console.log('✅ Fetch completed, response status:', response.status);
      
      if (!response.ok) {
        // Handle different error types
        const errorData = await response.json();
        console.error('❌ API Error Response:', errorData);
        
        if (response.status === 400) {
          // Validation error - show details
          console.error('🔍 Validation Error Details:', errorData.details);
          console.error('🔍 Full error response:', errorData);
          // Show specific validation error
          const firstError = errorData.details?.[0];
          if (firstError) {
            console.error('🔍 First validation error:', firstError);
            notifyError(`Validation failed: ${firstError.message || firstError.code || 'Unknown error'}`);
          } else {
            notifyError('Request validation failed. Check console for details.');
          }
          return;
        }
        
        if (response.status === 429) {
          // Rate limit or quota exceeded
          setHasUsageQuota(false);
          notifyError('Usage limit reached. Please try again later or check your billing.');
          return;
        }

        if (response.status === 401) {
          // API key issue
          setApiKeyConfigured(false);
          notifyError('API configuration issue. Please check your API keys in settings.');
          return;
        }
        
        throw new Error(`API error: ${response.status}`);
      }
      
      // Check if response is JSON or streaming
      const contentType = response.headers.get('content-type');
      console.log('🔍 Response content type:', contentType);
      
      if (contentType?.includes('application/json')) {
        // Handle JSON response (non-streaming)
        const responseData = await response.json();
        console.log('📄 JSON response received:', responseData);
        console.log('🔍 Response structure check:', {
          hasResponseData: !!responseData,
          hasCitations: !!responseData.citations,
          hasMetadata: !!responseData.metadata,
          hasMetadataCitations: !!responseData.metadata?.citations,
          citationsLength: responseData.citations?.length || 0,
          metadataCitationsLength: responseData.metadata?.citations?.length || 0,
          responseKeys: Object.keys(responseData || {}),
          metadataKeys: responseData.metadata ? Object.keys(responseData.metadata) : []
        });
        
        if (responseData.success === false) {
          throw new Error(responseData.message || 'API request failed');
        }
        
        // Simulate streaming for JSON responses
        const rawContent = responseData.content || responseData.message || 'No content received';
        // Ensure content is always a string
        const content = ensureStringContent(rawContent);
        const actualModel = responseData.model || selectedModel;
        
        // Update the currently used model to show the actual model from the API
        setCurrentlyUsedModel(actualModel);
        // Track usage in Zustand store
        if (responseData.usage) {
          ai.trackUsage({
            tokens: responseData.usage.totalTokens,
            cost: responseData.cost || 0
          });
        }
        
        // Update model performance metrics
        if (responseData.model) {
          ai.updateModelPerformance(responseData.model, {
            averageLatency: responseData.latency,
            averageCost: responseData.cost || 0,
            lastUsed: new Date()
          });
        }
        
        // Store file annotations for cost optimization
        if (responseData.fileAnnotations && attachedFiles.length > 0) {
          setDocuments(prev => {
            const updatedDocs = [];
            for (const doc of prev) {
              let matchingFile = null;
              for (const attachedFile of attachedFiles) {
                if (attachedFile.name === doc.name) {
                  matchingFile = attachedFile;
                  break;
                }
              }
              
              if (matchingFile && doc.type === 'application/pdf') {
                updatedDocs.push({
                  ...doc,
                  annotations: responseData.fileAnnotations
                });
              } else {
                updatedDocs.push(doc);
              }
            }
            return updatedDocs;
          });
        }
        
        // Extract citations from response (web search citations)
        // Check multiple locations where citations might be stored
        const webCitations = responseData.citations || 
                           responseData.metadata?.citations || 
                           [];
        const annotations = responseData.annotations || 
                          responseData.metadata?.annotations || 
                          [];
        
        // Extract file citations from the response content
        const fileCitations = extractFileCitations(content, attachedFiles);
        
        // Combine web and file citations
        const allCitations = [...webCitations, ...fileCitations];
        
        console.log('🔍 Citations extracted:', {
          hasAttachedFiles: attachedFiles.length > 0,
          attachedFilesCount: attachedFiles.length,
          webCitations: webCitations.length,
          fileCitations: fileCitations.length,
          allCitations: allCitations.length,
          webCitationsData: webCitations,
          fileCitationsData: fileCitations,
          fullResponseData: responseData,
          responseContent: content.substring(0, 500) + '...' // Show first 500 chars
        });
        
        // Update citations panel immediately if we have citations
        if (allCitations.length > 0) {
          console.log('📚 Updating citations panel with', allCitations.length, 'citations');
          onCitationsUpdate?.(allCitations);
        }
        
        await simulateStreaming(content, actualModel, { citations: allCitations, annotations });
        
      } else {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response stream available');
        }
        
        setIsStreaming(true);
        setCurrentStreamingMessage('');
        
        let fullContent = '';
        let streamingModel: string | null = null;
        for await (const data of readSSEData(reader)) {
          if (data === '[DONE]') break;
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(typeof parsed.error === 'string' ? parsed.error : 'AI response failed');
          if (parsed.model && !streamingModel) {
            streamingModel = parsed.model;
            setCurrentlyUsedModel(streamingModel);
          }
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += ensureStringContent(content);
            setCurrentStreamingMessage(fullContent);
          }
        }

        // Extract file citations from the final content
        const fileCitations = extractFileCitations(fullContent, attachedFiles);
        
        // Create final message
        const assistantMessage: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: 'assistant' as const,
          content: fullContent,
          timestamp: new Date(),
          metadata: {
            model: streamingModel || currentlyUsedModel || selectedModel,
            provider: selectedProvider,
            cost: 0.00, // This would be calculated based on actual usage
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            },
            citations: fileCitations, // Include file citations from streaming response
            annotations: []
          }
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        setCurrentStreamingMessage('');
        
        // Update citations panel if citations exist
        if (fileCitations && fileCitations.length > 0) {
          onCitationsUpdate?.(fileCitations);
        }
        
        // Track usage in Zustand store
        ai.trackUsage({
          tokens: 0, // Would use actual metrics from streaming
          cost: 0
        });
        
        // Update model performance metrics
        if (streamingModel) {
          ai.updateModelPerformance(streamingModel, {
            averageLatency: 0, // Would calculate from streaming start/end
            averageCost: 0,
            lastUsed: new Date()
          });
        }
        
        // Notify user of successful AI response
        notifySuccess('AI response generated successfully');
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Real AI API error:', error);
      
      // Handle specific error types
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('❌ Network error - failed to fetch API endpoint');
        notifyError('Network error: Unable to connect to AI service. Please check your internet connection and try again.');
      } else if (error instanceof Error) {
        console.error('❌ Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        notifyError('AI service error: ' + error.message);
      } else {
        console.error('❌ Unknown error type:', error);
        notifyError('AI service temporarily unavailable. Please try again.');
      }
    }
  };

  // Media API call for image generation
  const callMediaAPI = async (prompt: string, selectedModel: string) => {
    try {
      
      // Check if user is authenticated for media generation
      if (isSignedIn && !history.ready && !history.error) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading your conversation…</div>;
  }

  if (!isSignedIn) {
        notifyWarning('Please sign in to use image generation features.');
        return null;
      }
      
      const requestBody = {
        prompt,
        type: 'image', // Required field for media API
        model: selectedModel, // Use the actual selected model
        quality: 'auto',
        responseFormat: 'url',
        count: 1,
        metadata: {
          organizationId: (organizationId === 'demo' || !organizationId) ? null : organizationId,
          userId: userId,
        }
      };

      console.log('🎨 Sending request to media API with model:', {
        selectedModel,
        aiStoreModel: ai.selectedModel,
        imageGenerationMode,
        requestBody
      });
      
      const response = await fetch('/api/v1/ai/media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('✅ Media API response status:', response.status);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: 'Failed to parse error response', status: response.status, statusText: response.statusText };
        }
        console.error('❌ Media API Error Response:', errorData);
        console.error('❌ Response details:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        });
        
        if (response.status === 400) {
          notifyError(`Media generation failed: ${errorData.message || 'Invalid request'}`);
          return null;
        }
        
        if (response.status === 429) {
          notifyWarning('Rate limit reached for media generation. Please try again later.');
          return null;
        }
        
        if (response.status === 401) {
          notifyWarning('Media generation requires authentication.');
          return null;
        }
        
        throw new Error(`Media API error: ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('🎨 Media API response:', responseData);
      
      if (responseData.success && responseData.data && responseData.data.results && responseData.data.results.length > 0) {
        const imageData = responseData.data.results[0];
        
        // Track usage in Zustand store
        if (responseData.data.usage) {
          ai.trackUsage({
            tokens: 0, // Media generation doesn't use tokens
            cost: responseData.data.usage.cost || responseData.actualCost || 0
          });
        }
        
        notifySuccess('Image generated successfully');
        return {
          url: imageData.url,
          data: imageData.data, // Base64 data if requested
          revised_prompt: responseData.data.metadata?.revisedPrompt || prompt,
          cost: responseData.data.usage?.cost || responseData.actualCost || 0,
          model: responseData.data.model || requestBody.model
        };
      } else {
        throw new Error('No image data received from API');
      }
      
    } catch (error) {
      console.error('Media API error:', error);
      
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        notifyError('Network error: Unable to connect to media service. Please check your internet connection and try again.');
      } else if (error instanceof Error) {
        notifyError(`Media generation failed: ${error.message}`);
      } else {
        notifyError('Media generation service temporarily unavailable.');
      }
      
      return null;
    }
  };
  
  // Extract file citations from AI response
  const extractFileCitations = (content: string, attachedFiles: AttachedFile[]): Citation[] => {
    const citations: Citation[] = [];
    
    // Pattern to match file references like [filename.pdf]
    const fileRefPattern = /\[([^\[\]]+\.[a-zA-Z0-9]+)\]/g;
    const matches = Array.from(content.matchAll(fileRefPattern));
    
    matches.forEach((match, index) => {
      const fileName = match[1];
      const startIndex = match.index || 0;
      const endIndex = startIndex + match[0].length;
      
      // Find the corresponding file
      const file = attachedFiles.find(f => f.name === fileName);
      
      if (file) {
        citations.push({
          url: file.url || `file://${fileName}`,
          title: fileName,
          content: `Referenced file: ${fileName} (${file.type})`,
          start_index: startIndex,
          end_index: endIndex,
          type: 'file' as const
        });
      } else {
        // Even if file not found, create a citation for referenced filename
        citations.push({
          url: `file://${fileName}`,
          title: fileName,
          content: `Referenced document: ${fileName}`,
          start_index: startIndex,
          end_index: endIndex,
          type: 'file' as const
        });
      }
    });
    
    // Remove duplicates based on filename
    const uniqueCitations = [];
    const seenTitles = new Set();
    for (const citation of citations) {
      if (!seenTitles.has(citation.title)) {
        seenTitles.add(citation.title);
        uniqueCitations.push(citation);
      }
    }
    
    return uniqueCitations;
  };

  // Generate fallback content
  const generateFallbackContent = (messageContent: string) => {
    if (messageContent.trim().length === 0 || messageContent.trim() === '?') {
      return `I'm here to help you! Here are some ways I can assist:

**🎯 Information & Research**
- Answer questions on various topics
- Research and gather information
- Provide insights and analysis

**📝 Content & Documents**
- Review and analyze documents
- Extract information from files
- Summarize content

**💼 General Assistance**
- Problem solving
- Task planning
- Creative ideation

**📊 Data Analysis**
- Analyze patterns and trends
- Extract insights from data
- Provide recommendations

Try asking me something like:
- "Can you help me understand this document?"
- "What are the key points in this file?"
- "Help me research [topic]"
- "Analyze this information for me"

> **Note**: Connect your API keys for full functionality.`;
    }

    return `I understand you're asking about: "${messageContent}"

${documents.length > 0 ? `I can see you've attached ${documents.length} file(s). Let me analyze them for you.\n\n` : ''}
As your **AI Assistant**, I'm here to help you with your questions. Based on your query, here's how I can assist:

**🎯 For your specific question:**
- I can analyze the content and provide insights
- Extract key information and patterns
- Provide relevant context and explanations
- Suggest next steps and recommendations

**💡 Recommended next steps:**
1. Review the information provided
2. Analyze any relevant context or background
3. Develop an approach based on your specific needs

Would you like me to dive deeper into any aspects of your question?

> **Note**: Enable API keys for full functionality.`;
  };
  
  const simulateStreaming = async (fullContent: string, modelName?: string, metadata?: { citations?: Citation[]; annotations?: any[] }) => {
    // Small delay before starting to type (0.5-1 second)
    const typingDelay = Math.random() * 500 + 500; // 0.5-1 seconds
    await new Promise(resolve => setTimeout(resolve, typingDelay));
    
    // Start streaming
    setIsStreaming(true);
    setCurrentStreamingMessage('');
    
    const words = fullContent.split(' ');
    const totalWords = words.length;
    let currentIndex = 0;

    return new Promise<void>((resolve) => {
      const streamInterval = setInterval(() => {
        if (currentIndex < totalWords) {
          const wordsToAdd = Math.min(3, totalWords - currentIndex);
          const newWords = words.slice(currentIndex, currentIndex + wordsToAdd);
          const newContent = newWords.join(' ');
          
          setCurrentStreamingMessage(prev => 
            prev + (prev ? ' ' : '') + newContent
          );
          setStreamProgress((currentIndex / totalWords) * 100);
          currentIndex += wordsToAdd;
        } else {
          clearInterval(streamInterval);
          
          const assistantMessage: ChatMessage = {
            id: `assistant_${Date.now()}`,
            role: 'assistant' as const,
            content: fullContent,
            timestamp: new Date(),
            metadata: {
              model: modelName || currentlyUsedModel || 'Demo Mode',
              provider: selectedProvider,
              cost: 0.00,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
              },
              citations: metadata?.citations || [],
              annotations: metadata?.annotations || []
            }
          };
          setMessages(prev => [...prev, assistantMessage]);
          setCurrentStreamingMessage('');
          
          // Update citations panel if citations exist
          if (metadata?.citations && metadata.citations.length > 0) {
            onCitationsUpdate?.(metadata.citations);
          }
          
          // Notify user of successful response (demo mode)
          notifySuccess('Response generated successfully');
          resolve();
        }
      }, 30 + Math.random() * 70); // More realistic typing speed
    });
  };

  const calculateRealCost = (usage: any, model: string): number => {
    const costPerToken: Record<string, { prompt: number; completion: number }> = {
      'gpt-4o': { prompt: 0.005, completion: 0.015 },
      'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
      'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 }
    };

    const modelCost = costPerToken[model] || costPerToken['gpt-4o-mini'];
    const promptCost = (usage.promptTokens / 1000) * modelCost.prompt;
    const completionCost = (usage.completionTokens / 1000) * modelCost.completion;
    
    return promptCost + completionCost;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Collapse the tools panel when sending a message
    setShowToolsPanel(false);

    await sendMessage(input);
  };

  const resetChat = () => {
    setMessages([]);
    setInput('');
    setTotalCost(0);
    setCurrentStreamingMessage('');
    setDocuments([]); // Clear attached files when resetting chat
  };

  const handleFileUpload = async (files: FileList) => {
    if (!files || files.length === 0) return;

    console.log(`🔄 Starting file upload for ${files.length} files`);
    setIsUploading(true);
    setIsProcessingFiles(true);
    
    const maxFileSize = 50 * 1024 * 1024; // 50MB limit
    const maxFiles = 10;

    if (documents.length + files.length > maxFiles) {
      notifyError(`Maximum ${maxFiles} files allowed`);
      setIsUploading(false);
      setIsProcessingFiles(false);
      return;
    }
    
    for (const file of Array.from(files)) {
      console.log(`📁 Processing file: ${file.name} (${file.type}, ${file.size} bytes)`);
      
      // Validate file size
      if (file.size > maxFileSize) {
        notifyError(`File "${file.name}" exceeds 50MB limit`);
        continue;
      }

      // Enhanced file validation with extension fallback
      const validation = validateFile(file, maxFileSize);
      
      if (!validation.isValid) {
        notifyError(validation.error || `Failed to validate file: ${file.name}`);
        continue; // Skip this file and continue with others
      }
      
      // Create corrected file if needed
      let processedFile = file;
      if (validation.correctedMimeType) {
        processedFile = createCorrectedFile(file, validation.correctedMimeType);
        console.log(`[ENHANCED UPLOAD] File ${file.name} MIME type corrected: "${file.type}" → "${validation.correctedMimeType}"`);
      }
      
      const newDoc: UploadedDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${processedFile.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        name: processedFile.name,
        size: processedFile.size,
        type: processedFile.type, // This will be the corrected MIME type if applicable
        uploadedAt: new Date(),
        processing: true
      };
      
      setDocuments(prev => {
        const updated = [...prev, newDoc];
        console.log(`📄 Added document to state. Total documents: ${updated.length}`, {
          id: newDoc.id,
          name: newDoc.name,
          type: newDoc.type
        });
        return updated;
      });
      
      // Process different file types
      try {
        const fileUrl = URL.createObjectURL(processedFile);
        
        if (processedFile.type.startsWith('image/')) {
          // For images, keep original base64 for vision models
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64Data = e.target?.result as string;
            console.log('🖼️ Image processed for upload:', {
              fileName: processedFile.name,
              fileSize: processedFile.size,
              mimeType: processedFile.type,
              base64Length: base64Data.length
            });
            
            setDocuments(prev => {
              const updated = [];
              for (const doc of prev) {
                if (doc.id === newDoc.id) {
                  updated.push({
                    ...doc, 
                    processing: false, 
                    content: `![${processedFile.name}](${base64Data})`,
                    url: fileUrl,
                    file: processedFile,
                    base64: base64Data
                  });
                } else {
                  updated.push(doc);
                }
              }
              console.log(`🖼️ Image processing completed for ${processedFile.name}`);
              return updated;
            });
          };
          reader.readAsDataURL(processedFile);
        } else {
          // For documents, extract text using hybrid file processor
          try {
            console.log(`🔄 Extracting text from ${processedFile.name}...`);

            // Process with our hybrid file processor (server-side with browser fallback)
            const result = await hybridFileProcessor.processFileWithFallback(
              processedFile, // Pass the File object directly
              {
                maxTextLength: 2000000, // 2M chars max - enough for large PDFs
                extractMetadata: true,
                timeout: 60000 // Increase timeout for large files
              }
            );

            if (result.success && result.text.trim()) {
              // Successfully processed - store extracted text
              console.log(`✅ Text extraction successful for ${processedFile.name}: ${result.text.length} characters`);
              
              setDocuments(prev => prev.map(doc => 
                doc.id === newDoc.id 
                  ? { 
                      ...doc, 
                      processing: false, 
                      content: result.text,
                      url: fileUrl,
                      file: processedFile,
                      // Store processing info in annotations for the UI
                      annotations: {
                        processedText: result.text,
                        isProcessed: true,
                        processingMethod: result.processing.method,
                        extractedLength: result.text.length,
                        processingDuration: result.processing.duration
                      }
                    }
                  : doc
              ));
            } else {
              // Failed to process - fallback to base64
              console.log(`⚠️ Text extraction failed for ${processedFile.name}, falling back to base64`);
              
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64Data = e.target?.result as string;
                setDocuments(prev => prev.map(doc => 
                  doc.id === newDoc.id 
                    ? { 
                        ...doc, 
                        processing: false, 
                        content: `**Document:** ${processedFile.name} (${formatFileSize(processedFile.size)})`,
                        url: fileUrl,
                        file: processedFile,
                        base64: base64Data,
                        annotations: {
                          isProcessed: false,
                          processingError: result.error?.message || 'Failed to extract text'
                        }
                      }
                    : doc
                ));
              };
              reader.readAsDataURL(processedFile);
            }
          } catch (error) {
            console.error(`❌ Error processing file ${processedFile.name}:`, error);
            
            // Fallback to base64 on any error
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64Data = e.target?.result as string;
              setDocuments(prev => prev.map(doc => 
                doc.id === newDoc.id 
                  ? { 
                      ...doc, 
                      processing: false, 
                      content: `**Document:** ${processedFile.name} (${formatFileSize(processedFile.size)})`,
                      url: fileUrl,
                      file: processedFile,
                      base64: base64Data,
                      annotations: {
                        isProcessed: false,
                        processingError: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                      }
                    }
                  : doc
              ));
            };
            reader.readAsDataURL(processedFile);
          }
        }
      } catch (error) {
        console.error('Error processing file:', error);
        setDocuments(prev => prev.map(doc => 
          doc.id === newDoc.id 
            ? { ...doc, processing: false, content: `Error processing ${processedFile.name}` }
            : doc
        ));
      }
      
      // Small delay to prevent race conditions when processing multiple files
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ File upload completed. Processing ${Array.from(files).length} files`);
    setIsUploading(false);
    setIsProcessingFiles(false);
    // Keep tools panel open so user can see the uploaded files
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      notifySuccess('Copied to clipboard');
    } catch (err) {
      notifyError('Failed to copy');
    }
  };

  const handleShowSources = (citations: Citation[]) => {
    setActiveCitations(citations);
    onCitationsUpdate?.(citations);
  };

  const handleShare = () => {
    // TODO: Implement share functionality
    notifyInfo('Share functionality coming soon');
  };

  const handleThumbsUp = () => {
    // TODO: Implement feedback functionality
    notifySuccess('Thanks for your feedback!');
  };

  const handleThumbsDown = () => {
    // TODO: Implement feedback functionality
    notifySuccess('Thanks for your feedback!');
  };

  const insertTemplate = (template: ContentTemplate) => {
    setInput(template.template);
    setShowToolsPanel(false);
  };

  // Prevent hydration errors by only rendering after mount
  if (!isMounted) {
    return (
      <div className="flex h-full bg-background text-foreground items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Sign In Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              Please sign in to access the AI chat interface.
            </p>
            <SignInButton mode="modal">
              <Button className="w-full">Sign In</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className={`flex h-full bg-background text-foreground ${className} ${isDragOver ? 'bg-primary/10' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center z-50 border-2 border-dashed border-primary">
          <div className="text-center px-4">
            <Upload className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 text-primary" />
            <p className="text-lg sm:text-xl font-medium text-foreground">Drop files here to upload</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">Images, videos, audio, documents, and more</p>
          </div>
        </div>
      )}
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {history.error && <p role="status" className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{history.error}</p>}
        {/* Chat Messages */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" onScrollCapture={handleScroll}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-4xl mx-auto px-4 sm:px-6">
                  <div className="mb-6 sm:mb-8">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 text-foreground">
                      Welcome to AI Assistant
                    </h1>
                    <p className="text-base sm:text-lg lg:text-xl text-muted-foreground mb-6 sm:mb-8">
                      Your intelligent assistant for documents and information
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base text-foreground">Research & Analysis</h3>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Get insights and information on any topic</p>
                    </div>
                    <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <PenTool className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base text-foreground">Document Analysis</h3>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Extract information and insights from your documents</p>
                    </div>
                    <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base text-foreground">Content Creation</h3>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Draft, edit, and improve written content</p>
                    </div>
                    <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base text-foreground">Data Insights</h3>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Analyze patterns and extract meaningful insights</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      Start by asking a question or describing what you need help with
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        onClick={() => setInput('Help me analyze this document')}
                        className="px-3 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
                      >
                        Analyze document
                      </button>
                      <button
                        onClick={() => setInput('Summarize this information for me')}
                        className="px-3 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
                      >
                        Summarize
                      </button>
                      <button
                        onClick={() => setInput('What are the key points in this content?')}
                        className="px-3 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
                      >
                        Extract key points
                      </button>
                    </div>
                  </div>
                  
                  {documents.length > 0 && (
                    <div className="mt-6 rounded-lg p-4 bg-muted border border-border">
                      <p className="text-sm text-muted-foreground">
                        📎 {documents.length} file{documents.length > 1 ? 's' : ''} attached and ready for analysis
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`group w-full ${
                      message.role === 'assistant' 
                        ? 'bg-muted/50' 
                        : ''
                    }`}
                  >
                    <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-6 max-w-4xl mx-auto w-full">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {message.role === 'user' ? (
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                            You
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground">
                            <Sparkles className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      
                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {message.role === 'user' ? 'You' : 'AI Assistant'}
                          </span>
                          {message.role === 'assistant' && message.metadata?.model && (
                            <Badge variant="secondary" className="text-xs">
                              {message.metadata.model}
                            </Badge>
                          )}
                        </div>
                        <EnhancedMessageRenderer
                          content={message.content}
                          isMarkdown={true}
                          onCopy={handleCopy}
                          attachedFiles={message.attachedFiles}
                          citations={message.metadata?.citations}
                        />
                        
                        {/* Message Actions - Only for assistant messages */}
                        {message.role === 'assistant' && (
                          <MessageActions
                            content={message.content}
                            citations={message.metadata?.citations || []}
                            onCopy={handleCopy}
                            onShare={handleShare}
                            onShowSources={() => handleShowSources(message.metadata?.citations || [])}
                            onThumbsUp={handleThumbsUp}
                            onThumbsDown={handleThumbsDown}
                          />
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <button
                          onClick={() => handleCopy(message.content)}
                          className="p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Streaming Message */}
                {isStreaming && currentStreamingMessage && (
                  <div className="group w-full bg-muted/50">
                    <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-6 max-w-4xl mx-auto w-full">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            AI Assistant
                          </span>
                          {currentlyUsedModel && (
                            <Badge variant="secondary" className="text-xs">
                              {currentlyUsedModel}
                            </Badge>
                          )}
                        </div>
                        <div className="relative">
                          <EnhancedMessageRenderer
                            content={currentStreamingMessage}
                            isMarkdown={true}
                            onCopy={handleCopy}
                            citations={[]} // No citations during streaming
                          />
                          <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* AI Thinking Indicator */}
                {isThinking && (
                  <div className="group w-full bg-muted/50">
                    <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-6 max-w-4xl mx-auto w-full">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            AI Assistant
                          </span>
                          {currentlyUsedModel && (
                            <Badge variant="secondary" className="text-xs">
                              {currentlyUsedModel}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '0ms'}}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '150ms'}}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '300ms'}}></div>
                          </div>
                          <span className="text-sm text-muted-foreground ml-2">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* AI Typing Indicator */}
                {isLoading && !isThinking && !isStreaming && (
                  <div className="group w-full bg-muted/50">
                    <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-6 max-w-4xl mx-auto w-full">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            AI Assistant
                          </span>
                          {currentlyUsedModel && (
                            <Badge variant="secondary" className="text-xs">
                              {currentlyUsedModel}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '100ms'}}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '200ms'}}></div>
                          </div>
                          <span className="text-sm text-muted-foreground ml-2">Typing...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="bg-background border-t border-border pb-4 sm:pb-6 pt-3 sm:pt-4">
          <div className="max-w-4xl mx-auto px-3 sm:px-4">
            {/* Status Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3 px-1 sm:px-2">
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">AI Chat</span>
                </div>
                {selectedProvider && (
                  <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                    {providers.find(p => p.id === selectedProvider)?.name || selectedProvider}
                  </Badge>
                )}
                {features.openRouterEnabled && (
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-600 hidden sm:inline-flex">
                    <Zap className="h-3 w-3 mr-1" />
                    OpenRouter
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs text-green-600 border-green-600 hidden sm:inline-flex">
                  <Search className="h-3 w-3 mr-1" />
                  Real-time Web Search
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {currentlyUsedModel && (
                  <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                    {currentlyUsedModel}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {messages.length} message{messages.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="relative">
              {/* Attached Files Indicator */}
              {documents.length > 0 && (
                <div className="mb-3 px-1 sm:px-2">
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
                    <Paperclip className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-primary font-medium flex-1 min-w-0">
                      {documents.length} file{documents.length > 1 ? 's' : ''} attached
                      <span className="hidden sm:inline"> - will be included in all follow-up questions</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocuments([])}
                      className="flex-shrink-0 p-1 hover:bg-primary/20 rounded transition-colors"
                      title="Clear all files"
                    >
                      <X className="h-3 w-3 text-primary" />
                    </button>
                  </div>
                </div>
              )}
              
              {/* Tools Panel */}
              {showToolsPanel && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-xl bg-card border border-border max-h-[70vh]">
                  <div className="flex border-b border-border">
                    <button
                      type="button"
                      onClick={() => setActiveToolsTab('tools')}
                      className={`flex-1 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                        activeToolsTab === 'tools' 
                          ? 'text-foreground bg-muted' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Wand2 className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Tools</span>
                      <span className="sm:hidden">Tools</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveToolsTab('files')}
                      className={`flex-1 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                        activeToolsTab === 'files'
                          ? 'text-foreground bg-muted'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Files</span>
                      <span className="sm:hidden">Files</span>
                    </button>
                  </div>

                  <div className="p-3 sm:p-4 max-h-60 sm:max-h-80 overflow-y-auto">
                    {activeToolsTab === 'tools' && (
                      <div className="space-y-3">
                        {/* Model Selection */}
                        <div>
                          <h4 className="text-sm font-medium text-foreground mb-2">AI Model Settings</h4>
                          <div className="space-y-3">
                            
                            {/* OpenRouter Integration Toggle */}
                            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                              <div className="flex items-center space-x-2">
                                <Zap className="h-4 w-4 text-primary" />
                                <div>
                                  <div className="text-sm font-medium text-foreground">OpenRouter</div>
                                  <div className="text-xs text-muted-foreground">Access to 200+ AI models</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newValue = !features.openRouterEnabled;
                                  ai.toggleFeature('openRouterEnabled', newValue);

                                  if (newValue) {
                                    // Turning ON OpenRouter - turn OFF ImageRouter
                                    if (imageGenerationMode) {
                                      console.log('🔄 OpenRouter enabled - disabling ImageRouter');
                                      setImageGenerationMode(false);
                                    }

                                    // Auto-select first OpenRouter model
                                    const openRouterProvider = providers.find(p => p.id === 'openrouter');
                                    if (openRouterProvider && openRouterProvider.models.length > 0) {
                                      const firstModel = openRouterProvider.models[0];
                                      const modelToSet = firstModel.id || firstModel.name;
                                      console.log('✅ Auto-selecting first OpenRouter model:', modelToSet);
                                      ai.setSelectedModel(modelToSet);
                                    }
                                  }
                                  // Note: When OpenRouter is turned OFF, we don't automatically enable ImageRouter
                                  // to avoid infinite loops. User must explicitly enable ImageRouter.
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  features.openRouterEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                                    features.openRouterEnabled ? 'translate-x-6' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>
                            
                            {/* Provider/Model Selection */}
                            <div className="space-y-2">
                              <Select
                                value={selectedProvider}
                                onValueChange={(value) => {
                                  // Reset to first model of new provider
                                  const provider = providers.find(p => p.id === value);
                                  if (provider && provider.models.length > 0) {
                                    ai.setSelectedModel(provider.models[0].id);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-full bg-background border-border">
                                  <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border">
                                  {providers.map(provider => (
                                    <SelectItem
                                      key={provider.id}
                                      value={provider.id}
                                      className="text-foreground hover:bg-muted"
                                    >
                                      {provider.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <ModelSelectionModal
                                selectedProvider={selectedProvider}
                                selectedModel={selectedModel}
                                onModelSelect={(model) => ai.setSelectedModel(model)}
                                providers={providers}
                                mode={modalMode}
                                onModeChange={setModalMode}
                                trigger={
                                  <Button variant="outline" className="w-full justify-between">
                                    <span>
                                      {providers
                                        .find(p => p.id === selectedProvider)
                                        ?.models.find(m => m.id === selectedModel)?.name || 'Select model'}
                                    </span>
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                }
                              />
                            </div>

                            {/* Image Generation Toggle */}
                            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                              <div className="flex items-center space-x-2">
                                <PenTool className="h-4 w-4 text-primary" />
                                <div>
                                  <div className="text-sm font-medium text-foreground">Image Generation</div>
                                  <div className="text-xs text-muted-foreground">
                                    {imageRouter.isLoading ? 'Loading models...' : 'Generate images instead of text'}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={handleImageGenerationToggle}
                                disabled={imageRouter.isLoading || ai.loading}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  imageGenerationMode ? 'bg-primary' : 'bg-muted-foreground/30'
                                } ${(imageRouter.isLoading || ai.loading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                                    imageGenerationMode ? 'translate-x-6' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <Separator className="bg-border" />
                        
                        <div>
                          <h4 className="text-sm font-medium text-foreground mb-2">Content Templates</h4>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {contentTemplates.map((template) => {
                              const IconComponent = template.icon;
                              return (
                                <button
                                  key={template.id}
                                  type="button"
                                  onClick={() => insertTemplate(template)}
                                  className="flex-shrink-0 p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors group min-w-[120px]"
                                  title={template.description}
                                >
                                  <div className="flex flex-col items-center space-y-1">
                                    <IconComponent className="w-5 h-5 text-primary" />
                                    <span className="font-medium text-xs text-foreground text-center leading-tight">{template.name}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeToolsTab === 'files' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-foreground">Uploaded Files</h4>
                          <div className="flex items-center gap-2">
                            {documents.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setDocuments([])}
                                className="text-xs text-destructive hover:text-destructive/80"
                              >
                                Clear All
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs text-primary hover:text-primary/80"
                            >
                              Add Files
                            </button>
                          </div>
                        </div>
                        {documents.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Upload className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm">No files uploaded yet</p>
                            <p className="text-xs mt-1">Drag and drop files or click to upload</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {documents.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                <div className="flex items-center space-x-2 flex-1 min-w-0">
                                  <div className="flex items-center space-x-1 flex-shrink-0">
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                    {doc.processing && (
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                    )}
                                    {doc.annotations?.isProcessed && (
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                    )}
                                    {doc.annotations?.processingError && (
                                      <X className="w-3 h-3 text-red-500" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                                    <div className="text-xs text-muted-foreground">
                                      <span>{formatFileSize(doc.size)}</span>
                                      {doc.processing && (
                                        <span className="text-blue-600"> • Processing...</span>
                                      )}
                                      {doc.annotations?.isProcessed && doc.annotations?.extractedLength && (
                                        <span className="text-green-600"> • {doc.annotations.extractedLength.toLocaleString()} chars extracted</span>
                                      )}
                                      {doc.annotations?.processingError && (
                                        <span className="text-red-600"> • Processing failed</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeDocument(doc.id)}
                                  className="text-muted-foreground hover:text-destructive p-1"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            {isProcessingFiles && (
                              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                <span className="text-sm text-blue-600">Processing files...</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* Loading Status */}
              {isInputDisabled && (ai.loading || models.length === 0) && (
                <div className="mb-3 flex items-center justify-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {ai.loading ? "Loading AI models..." : "Initializing AI services..."}
                  </span>
                </div>
              )}

              {/* Input Field */}
              <div className="relative rounded-2xl overflow-hidden bg-background border border-border shadow-sm">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isInputDisabled && ai.loading ? "Loading AI models..." : isInputDisabled && models.length === 0 ? "Initializing AI services..." : "Message AI Assistant"}
                  className="min-h-[60px] sm:min-h-[80px] max-h-[150px] sm:max-h-[200px] w-full bg-transparent border-0 resize-none focus:ring-0 px-3 sm:px-4 py-2 sm:py-3 pr-14 sm:pr-16 text-sm sm:text-base text-foreground placeholder-muted-foreground overflow-y-auto"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!isInputDisabled) {
                        handleSubmit(e);
                      }
                    }
                  }}
                  onPaste={handlePaste}
                  disabled={isInputDisabled}
                  rows={2}
                />
                
                {/* Tools Button */}
                <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3">
                  <button
                    type="button"
                    onClick={() => setShowToolsPanel(!showToolsPanel)}
                    className="p-1.5 sm:p-2 rounded-lg transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>

                {(isLoading || isThinking || isStreaming) && <button type="button" onClick={() => requestAbort.current?.abort()} className="absolute bottom-3 right-14 rounded-md border bg-background px-3 py-1.5 text-sm" aria-label="Stop response">Stop</button>}
                {/* Send Button */}
                <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3">
                  <button
                    type="submit"
                    disabled={!input.trim() || isInputDisabled}
                    className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                      !input.trim() || isInputDisabled
                        ? 'text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                    title={isInputDisabled && ai.loading ? "Loading AI models..." : isInputDisabled && models.length === 0 ? "Initializing AI services..." : "Send message"}
                  >
                    {isInputDisabled && (ai.loading || models.length === 0) ? (
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-current border-t-transparent" />
                    ) : isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-current border-t-transparent" />
                    ) : (
                      <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFileUpload(e.target.files);
            // Reset the input value to allow selecting the same file again
            e.target.value = '';
          }
        }}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.md,.html,.css,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.h,.php,.rb,.go,.rs,.swift,.kt,.scala,.sql,.zip,.rar,.7z,.tar,.gz,.bz2"
      />

    </div>
  );
}