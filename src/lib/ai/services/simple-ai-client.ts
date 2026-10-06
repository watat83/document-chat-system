/**
 * Simple AI client that bypasses complex routing and directly calls OpenRouter
 */

export interface SimpleAIRequest {
  model: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  maxTokens?: number
  temperature?: number
}

export interface SimpleAIResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  cost?: number
}

export class SimpleAIClient {
  private apiKey: string
  private baseUrl: string
  private isOpenAI: boolean

  constructor(apiKey?: string) {
    // Explicit API key loading with debug info
    const envOpenAI = process.env.OPENAI_API_KEY
    const envOpenRouter = process.env.OPENROUTER_API_KEY
    const envAnthropic = process.env.ANTHROPIC_API_KEY

    console.log(`🔍 [AI CLIENT] Environment keys available:`, {
      openAI: !!envOpenAI,
      openRouter: !!envOpenRouter,
      anthropic: !!envAnthropic,
      openAILength: envOpenAI?.length || 0,
    })

    // Store API keys for dynamic provider selection
    this.apiKey = apiKey || envOpenAI || envOpenRouter || envAnthropic || ''
    
    // We'll determine provider dynamically based on model name
    this.isOpenAI = false // Will be set per request
    this.baseUrl = '' // Will be set per request

    if (!this.apiKey) {
      console.error(
        `❌ [AI CLIENT] No API key found in environment or provided`
      )
      console.error(
        `❌ [AI CLIENT] Available env vars:`,
        Object.keys(process.env).filter((k) => k.includes('API_KEY'))
      )
    } else {
      console.log(
        `✅ [AI CLIENT] Initialized with multi-provider support, key length: ${this.apiKey.length}`
      )
    }
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(model: string, usage: any): number {
    // Cost per million tokens (approximate)
    const costMap: Record<string, { input: number; output: number }> = {
      "deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
      "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
      "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 },
      "anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
      "meta-llama/llama-3.1-8b-instruct": { input: 0.18, output: 0.18 },
      "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
      "openai/gpt-4o": { input: 2.5, output: 10.0 },
      "gpt-4o-mini": { input: 0.15, output: 0.6 },
      "gpt-4o": { input: 2.5, output: 10.0 }
    };
    
    const costs = costMap[model] || { input: 1.0, output: 3.0 };
    const inputCost = (usage.prompt_tokens / 1_000_000) * costs.input;
    const outputCost = (usage.completion_tokens / 1_000_000) * costs.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get provider configuration based on model name
   */
  private getProviderConfig(model: string): {
    provider: string
    actualModel: string
    apiKey: string
    baseUrl: string
    isOpenRouter: boolean
  } {
    const envOpenAI = process.env.OPENAI_API_KEY
    const envOpenRouter = process.env.OPENROUTER_API_KEY

    // OpenAI models (use OpenAI directly)
    if (model.includes('gpt-') || model.includes('openai/')) {
      const cleanModel = model.replace('openai/', '')
      return {
        provider: 'OpenAI',
        actualModel: cleanModel,
        apiKey: envOpenAI || this.apiKey,
        baseUrl: 'https://api.openai.com/v1',
        isOpenRouter: false
      }
    }
    
    // All other models use OpenRouter (including Anthropic, DeepSeek, Llama, etc.)
    if (model.includes('claude-') || 
        model.includes('deepseek-') ||
        model.includes('llama-') ||
        model.includes('anthropic/') ||
        model.includes('deepseek/') ||
        model.includes('meta-llama/')) {
      return {
        provider: 'OpenRouter',
        actualModel: model, // Keep OpenRouter format (provider/model)
        apiKey: envOpenRouter || this.apiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        isOpenRouter: true
      }
    }
    
    // Default to OpenAI for unknown models
    console.warn(`⚠️ [AI CLIENT] Unknown model ${model}, defaulting to OpenAI`)
    return {
      provider: 'OpenAI',
      actualModel: 'gpt-4o-mini',
      apiKey: envOpenAI || this.apiKey,
      baseUrl: 'https://api.openai.com/v1',
      isOpenRouter: false
    }
  }

  async generateCompletion(
    request: SimpleAIRequest
  ): Promise<SimpleAIResponse> {
    if (!this.apiKey) {
      console.error(`❌ [AI CLIENT] No API key available for AI requests`)
      throw new Error('No API key available for AI requests')
    }

    // Determine provider and API details based on model name
    const { provider, actualModel, apiKey, baseUrl, isOpenRouter } = this.getProviderConfig(request.model)

    console.log(
      `🤖 [AI CLIENT] Making AI request via ${provider} to ${actualModel}`
    )
    console.log(`🤖 [AI CLIENT] Request details:`, {
      messages: request.messages.length,
      maxTokens: request.maxTokens || 4000, // 4k tokens max for GPT-4o output
      temperature: request.temperature || 0.3,
      totalPromptChars: request.messages
        .map((m) => m.content.length)
        .reduce((a, b) => a + b, 0),
    })

    // Create an AbortController for request timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => {
        console.error(
          `⏰ [AI CLIENT] Request timeout after 2 minutes for model: ${actualModel} via ${provider}`
        )
        console.error(
          `⏰ [AI CLIENT] This indicates the ${provider} API is not responding`
        )
        controller.abort()
      },
      2 * 60 * 1000
    ) // 2 minute timeout

    try {
      // Build headers dynamically based on provider
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }

      // Add OpenRouter-specific headers
      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://document-chat-system.vercel.app'
        headers['X-Title'] = 'Document Chat System'
      }

      console.log(
        `🌐 [AI CLIENT] Making fetch request to ${baseUrl}/chat/completions`
      )

      const requestStart = Date.now()
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: actualModel,
          messages: request.messages,
          max_tokens: request.maxTokens || 4000, // 4k tokens max for GPT-4 Turbo output
          temperature: request.temperature || 0.3,
          stream: false,
        }),
        signal: controller.signal,
      })

      const requestDuration = Date.now() - requestStart
      console.log(
        `📡 [AI CLIENT] Fetch completed in ${requestDuration}ms, status: ${response.status}`
      )

      clearTimeout(timeoutId) // Clear timeout on successful response

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `❌ [AI CLIENT] API request failed: ${response.status} ${response.statusText}`
        )
        console.error(`❌ [AI CLIENT] Error response: ${errorText}`)

        // Parse error response to check for quota issues
        let errorMessage = `AI API request failed: ${response.status} ${response.statusText} - ${errorText}`
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error?.code === 'insufficient_quota' || response.status === 429) {
            errorMessage = '⚠️ OpenAI API Quota Exceeded. Please add credits to your OpenAI account at https://platform.openai.com/account/billing'
            console.error('💳 OpenAI quota exceeded. Visit https://platform.openai.com/account/billing to add credits.')
          }
        } catch (e) {
          // If error parsing fails, use the default error message
        }

        throw new Error(errorMessage)
      }

      console.log(`📥 [AI CLIENT] Parsing JSON response...`)
      const data = await response.json()

      console.log(`📊 [AI CLIENT] Response structure:`, {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length || 0,
        hasUsage: !!data.usage,
        model: data.model,
      })

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error(`❌ [AI CLIENT] Invalid AI response format:`, data)
        throw new Error('Invalid response format from AI API')
      }

      const calculatedCost = data.usage ? this.calculateCost(actualModel, data.usage) : 0;

      console.log(
        `✅ [AI CLIENT] Request completed successfully with ${data.usage?.total_tokens || 'unknown'} tokens, cost: $${calculatedCost.toFixed(6)}`
      )

      return {
        content: data.choices[0].message.content,
        model: data.model || request.model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        cost: calculatedCost,
      }
    } catch (error: Error | any) {
      clearTimeout(timeoutId)

      console.error(`❌ [AI CLIENT] Error during AI request:`, {
        errorName: error?.name,
        errorMessage: error?.message,
        errorType: typeof error,
        isAbortError: error?.name === 'AbortError',
      })

      if (error?.name === 'AbortError') {
        console.error(`⏰ [AI CLIENT] Request was aborted due to timeout`)
        throw new Error('AI request timeout - operation took too long')
      }

      console.error(`❌ [AI CLIENT] Full error details:`, error)
      throw error
    }
  }
}

// Singleton instance
export const simpleAIClient = new SimpleAIClient()
