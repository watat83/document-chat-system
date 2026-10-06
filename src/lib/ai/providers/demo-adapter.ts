import {
  AIProviderAdapter,
  UnifiedCompletionRequest,
  UnifiedCompletionResponse,
  UnifiedEmbeddingRequest,
  UnifiedEmbeddingResponse,
  UnifiedStreamRequest,
  UnifiedStreamChunk,
  ProviderCapabilities,
  ModelInfo,
  CostEstimate,
  TokenEstimate
} from '../interfaces';

export interface DemoConfig {
  organizationId?: string;
  simulateLatency?: boolean;
  minLatency?: number;
  maxLatency?: number;
  errorRate?: number; // 0-1, percentage of requests that should fail
}

export class DemoAdapter extends AIProviderAdapter {
  private config: DemoConfig;
  private availableModels: ModelInfo[] = [];

  constructor(config: DemoConfig = {}) {
    super('demo');
    this.config = {
      simulateLatency: true,
      minLatency: 500,
      maxLatency: 2000,
      errorRate: 0,
      ...config
    };
    this.initializeModels();
  }

  async loadAvailableModels(): Promise<ModelInfo[]> { return this.getAvailableModels(); }
  async refreshModels(): Promise<void> { this.initializeModels(); }

  private initializeModels(): void {
    this.availableModels = [
      {
        name: 'demo-gpt-4o-mini',
        provider: 'demo',
        displayName: 'Demo GPT-4o Mini',
        description: 'Simulated GPT-4o Mini with government contracting expertise',
        maxTokens: 128000,
        costPer1KTokens: {
          prompt: 0,
          completion: 0
        },
        averageLatency: 1000,
        qualityScore: 0.85,
        tier: 'balanced',
        features: ['chat', 'text-generation', 'reasoning', 'government-contracting'],
        metadata: {
          isDemo: true,
          specialization: 'government-contracting',
          alwaysAvailable: true
        }
      },
      {
        name: 'demo-gpt-4o',
        provider: 'demo',
        displayName: 'Demo GPT-4o',
        description: 'Simulated GPT-4o with advanced government contracting capabilities',
        maxTokens: 128000,
        costPer1KTokens: {
          prompt: 0,
          completion: 0
        },
        averageLatency: 1500,
        qualityScore: 0.95,
        tier: 'powerful',
        features: ['chat', 'text-generation', 'reasoning', 'vision', 'government-contracting'],
        metadata: {
          isDemo: true,
          specialization: 'government-contracting',
          alwaysAvailable: true
        }
      },
      {
        name: 'demo-claude-3-5-sonnet',
        provider: 'demo',
        displayName: 'Demo Claude 3.5 Sonnet',
        description: 'Simulated Claude 3.5 Sonnet with document analysis capabilities',
        maxTokens: 200000,
        costPer1KTokens: {
          prompt: 0,
          completion: 0
        },
        averageLatency: 1200,
        qualityScore: 0.90,
        tier: 'balanced',
        features: ['chat', 'text-generation', 'reasoning', 'document-analysis', 'government-contracting'],
        metadata: {
          isDemo: true,
          specialization: 'document-analysis',
          alwaysAvailable: true
        }
      }
    ];
  }

  async initialize(): Promise<void> {
    // Demo provider is always ready
    this.updateHealth(true);
  }

  async generateCompletion(request: UnifiedCompletionRequest): Promise<UnifiedCompletionResponse> {
    await this.simulateProcessingTime();

    // Simulate occasional errors if configured
    if (this.config.errorRate && Math.random() < this.config.errorRate) {
      throw new Error('Demo provider simulated error');
    }

    const content = this.generateDemoContent(request);
    const usage = this.calculateUsage(request, content);

    return {
      content,
      model: request.model,
      usage,
      metadata: {
        provider: 'demo',
        model: request.model,
        finishReason: 'stop',
        isDemo: true,
        responseTime: Math.random() * 1000 + 500
      }
    };
  }

  async streamCompletion(request: UnifiedStreamRequest): Promise<AsyncIterable<UnifiedStreamChunk>> {
    return this.streamGenerator(request);
  }

  async *streamGenerator(request: UnifiedStreamRequest): AsyncGenerator<UnifiedStreamChunk> {
    await this.simulateProcessingTime();

    const content = this.generateDemoContent(request);
    const words = content.split(' ');

    // Stream words in chunks
    for (let i = 0; i < words.length; i += 2) {
      const chunk = words.slice(i, i + 2).join(' ');

      yield {
        content: chunk + (i + 2 < words.length ? ' ' : ''),
        metadata: {
          provider: 'demo',
          model: request.model,
          isDemo: true,
          chunkIndex: Math.floor(i / 2)
        }
      };

      // Add small delay between chunks to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    }

    // Final chunk with metadata
    yield {
      content: '',
      metadata: {
        provider: 'demo',
        model: request.model,
        finishReason: 'stop',
        isDemo: true,
        usage: this.calculateUsage(request, content)
      }
    };
  }

  async generateEmbedding(request: UnifiedEmbeddingRequest): Promise<UnifiedEmbeddingResponse> {
    await this.simulateProcessingTime();

    const texts = Array.isArray(request.text) ? request.text : [request.text];
    const dimensions = request.dimensions ?? 1536;
    const embeddings = texts.map(() => Array.from({ length: dimensions }, () => Math.random() * 2 - 1));
    return { embedding: Array.isArray(request.text) ? embeddings : embeddings[0], model: request.model,
      usage: { totalTokens: texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0) }, metadata: { provider: 'demo', dimensions, cost: 0 } };
  }

  async estimateTokens(text: string, model?: string): Promise<TokenEstimate> {
    // Rough estimation: ~4 characters per token
    const estimatedTokens = Math.ceil(text.length / 4);

    return {
      prompt: Math.floor(estimatedTokens * 0.6),
      completion: Math.ceil(estimatedTokens * 0.4),
      total: estimatedTokens
    };
  }

  async estimateCost(request: UnifiedCompletionRequest | UnifiedEmbeddingRequest): Promise<CostEstimate> {
    // Demo provider is always free
    return {
      estimatedCost: 0,
      breakdown: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        promptCost: 0,
        completionCost: 0
      }
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxTokens: 200000,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsVision: true,
      models: {
        completion: ['demo-gpt-4o-mini', 'demo-gpt-4o', 'demo-claude-3-5-sonnet'],
        embedding: ['demo-text-embedding-ada-002']
      }
    };
  }

  getAvailableModels(): ModelInfo[] {
    return [...this.availableModels];
  }

  async checkHealth(): Promise<boolean> {
    // Demo provider is always healthy
    this.updateHealth(true);
    return true;
  }

  private async simulateProcessingTime(): Promise<void> {
    if (!this.config.simulateLatency) return;

    const latency = Math.random() *
      (this.config.maxLatency! - this.config.minLatency!) +
      this.config.minLatency!;

    await new Promise(resolve => setTimeout(resolve, latency));
  }

  private generateDemoContent(request: UnifiedCompletionRequest | UnifiedStreamRequest): string {
    const lastMessage = request.messages[request.messages.length - 1];
    const userInput = lastMessage?.content || '';

    // Generate context-aware demo content based on government contracting keywords
    return this.generateGovernmentContractingResponse(userInput);
  }

  private generateGovernmentContractingResponse(userInput: string): string {
    const input = userInput.toLowerCase();

    // NAICS-related responses
    if (input.includes('naics')) {
      return `Based on your query about NAICS codes, I can help you understand the North American Industry Classification System. Here's what you need to know:

**NAICS Code Analysis:**
- NAICS codes are 6-digit numbers that classify business establishments
- They're used by government agencies to determine contract eligibility
- Your primary NAICS code should match your core business activities

**Key Considerations:**
- Small business size standards vary by NAICS code
- Some contracts are set aside for specific NAICS codes
- You can have multiple NAICS codes but only one primary

**Recommendations:**
1. Review your current NAICS code alignment
2. Consider secondary codes for diversification
3. Monitor opportunities in related NAICS categories

Would you like me to help analyze specific NAICS codes or discuss size standard requirements?

*Note: This is a demo response. Enable API integration for comprehensive NAICS analysis.*`;
    }

    // Proposal-related responses
    if (input.includes('proposal') || input.includes('rfp')) {
      return `I can help you develop a winning government proposal. Here's a strategic approach:

**Proposal Development Framework:**
1. **Opportunity Analysis**
   - Requirement understanding
   - Competition assessment
   - Win probability evaluation

2. **Technical Approach**
   - Solution architecture
   - Implementation methodology
   - Risk mitigation strategies

3. **Management Approach**
   - Team structure and qualifications
   - Project management framework
   - Quality assurance processes

4. **Cost Strategy**
   - Competitive pricing analysis
   - Cost breakdown structure
   - Value proposition emphasis

**Key Success Factors:**
- Address all requirements explicitly
- Demonstrate past performance relevance
- Show clear benefits to the government
- Ensure compliance with all terms

Would you like me to review specific sections of your proposal or help with compliance checking?

*Note: This is a demo response. Connect API keys for detailed proposal analysis.*`;
    }

    // Compliance-related responses
    if (input.includes('compliance') || input.includes('far') || input.includes('dfars')) {
      return `I can help you navigate federal acquisition regulations and compliance requirements:

**Federal Acquisition Regulation (FAR) Compliance:**
- FAR Part 9: Contractor Qualifications
- FAR Part 15: Contracting by Negotiation
- FAR Part 52: Solicitation Provisions and Contract Clauses

**DFARS Considerations:**
- Defense-specific requirements
- Cybersecurity compliance (DFARS 252.204-7012)
- Supply chain security requirements

**Compliance Checklist:**
✓ Verify registration in SAM.gov
✓ Maintain required certifications
✓ Implement cybersecurity controls
✓ Document quality management system
✓ Establish accounting system compliance

**Common Compliance Issues:**
- Incomplete certifications
- Inadequate cybersecurity measures
- Poor record keeping
- Lack of small business subcontracting plans

Would you like me to help with specific compliance requirements or audit preparation?

*Note: This is a demo response. Full compliance analysis requires API access.*`;
    }

    // Opportunity-related responses
    if (input.includes('opportunity') || input.includes('contract') || input.includes('search')) {
      return `I can help you find relevant government contracting opportunities:

**Opportunity Discovery Strategy:**
1. **Primary Sources**
   - SAM.gov (beta.sam.gov)
   - FedBizOpps archives
   - Agency-specific portals

2. **Search Optimization**
   - Use relevant NAICS codes
   - Set up keyword alerts
   - Monitor amendment notifications

3. **Opportunity Evaluation**
   - Assess fit with capabilities
   - Evaluate competition level
   - Review incumbent performance

**Current Focus Areas:**
- Cybersecurity and IT modernization
- Climate and clean energy initiatives
- Supply chain resilience
- Healthcare technology
- Infrastructure development

**Recommended Actions:**
- Set up automated opportunity monitoring
- Build relationships with contracting officers
- Develop teaming partnerships
- Maintain capability statements

Would you like me to help set up opportunity tracking or analyze specific opportunities?

*Note: This is a demo response. Real-time opportunity tracking requires API integration.*`;
    }

    // Generic government contracting response
    return `I'm here to help you navigate government contracting successfully. As your AI assistant, I can provide guidance on:

**🎯 Core Areas of Expertise:**
- **Opportunity Discovery**: Finding and evaluating federal, state, and local contracts
- **Proposal Development**: Writing winning proposals and ensuring compliance
- **Regulatory Compliance**: Understanding FAR, DFARS, and other requirements
- **Market Research**: Analyzing spending patterns and competition
- **Business Development**: Identifying teaming opportunities and partnerships

**💡 Based on your query:** "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"

Here's how I can help you move forward:

1. **Immediate Actions**: Identify specific steps you can take today
2. **Strategic Planning**: Develop long-term positioning strategies
3. **Risk Assessment**: Evaluate potential challenges and mitigation approaches
4. **Resource Optimization**: Maximize your competitive advantages

**What would you like to focus on?**
- Finding specific opportunities in your industry
- Reviewing proposal content for compliance
- Understanding certification requirements
- Developing teaming strategies
- Analyzing market trends

*Note: This is a demonstration of Document Chat System's capabilities. Connect your API keys for real-time data and comprehensive analysis.*`;
  }

  private calculateUsage(request: UnifiedCompletionRequest | UnifiedStreamRequest, content: string): any {
    const inputText = request.messages.map(m => m.content).join(' ');
    const promptTokens = Math.ceil(inputText.length / 4);
    const completionTokens = Math.ceil(content.length / 4);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }
}
