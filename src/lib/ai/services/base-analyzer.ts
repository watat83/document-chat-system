import { simpleAIClient } from './simple-ai-client'

/**
 * Base analyzer class with shared functionality for all document analyzers
 */
export abstract class BaseAnalyzer {
  protected constructor() {
    // No initialization needed for simple client
  }

  /**
   * Execute an AI request with timeout protection
   */
  protected async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = 60000,
    operation: string = 'AI request'
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        console.error(`🚨 [${this.getAnalyzerName()}] TIMEOUT - ${operation} took longer than ${timeoutMs}ms`);
        console.error(`🚨 [${this.getAnalyzerName()}] This timeout is likely causing phase 1 to hang`);
        reject(new Error(`Timeout: ${operation} took longer than ${timeoutMs}ms`));
      }, timeoutMs);
    });

    console.log(`⏱️ [${this.getAnalyzerName()}] Starting ${operation} with ${timeoutMs}ms timeout...`);

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      console.log(`✅ [${this.getAnalyzerName()}] ${operation} completed in time, timeout cleared`);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      console.error(`❌ [${this.getAnalyzerName()}] ${operation} failed:`, {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
        timeoutMs: timeoutMs
      });
      throw error;
    }
  }

  /**
   * Execute AI completion with standard configuration
   */
  protected async executeAICompletion(
    prompt: string,
    systemMessage: string,
    options: {
      model?: string
      maxTokens?: number
      temperature?: number
      timeoutMs?: number
    } = {}
  ): Promise<string> {
    const {
      model = 'gpt-4o',
      maxTokens = 4000, // 4k tokens max for GPT-4o output
      temperature = 0.3,
      timeoutMs = 60000
    } = options;

    console.log(`🔍 [${this.getAnalyzerName()}] Starting AI analysis`);
    console.log(`🔍 [${this.getAnalyzerName()}] Model: ${model}, Prompt length: ${prompt.length} characters`);
    console.log(`🔍 [${this.getAnalyzerName()}] CHECKPOINT A: About to call simpleAIClient.generateCompletion...`);

    const aiRequest = simpleAIClient.generateCompletion({
      model,
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      maxTokens,
      temperature
    });

    console.log(`🔍 [${this.getAnalyzerName()}] CHECKPOINT B: simpleAIClient.generateCompletion created, starting executeWithTimeout...`);
    const result = await this.executeWithTimeout(aiRequest, timeoutMs, 'AI completion');
    console.log(`🔍 [${this.getAnalyzerName()}] CHECKPOINT C: executeWithTimeout completed successfully`);

    console.log(`✅ [${this.getAnalyzerName()}] AI service responded with content length: ${result.content?.length || 0}`);

    if (!result.content) {
      throw new Error('No response from AI service');
    }

    return result.content;
  }

  /**
   * Validate and sanitize string arrays
   */
  protected validateStringArray(
    arr: any,
    minItems: number = 0,
    maxItems: number = 20,
    defaultItems: string[] = []
  ): string[] {
    if (!Array.isArray(arr)) {
      console.warn(`🔍 [${this.getAnalyzerName()}] Expected array but got ${typeof arr}, using defaults`);
      return defaultItems;
    }

    const filtered = arr
      .filter(item => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.trim())
      .slice(0, maxItems);

    // Ensure we have at least minItems
    if (filtered.length < minItems && defaultItems.length > 0) {
      const needed = minItems - filtered.length;
      return [...filtered, ...defaultItems.slice(0, needed)];
    }

    return filtered;
  }

  /**
   * Validate and clamp numeric scores
   */
  protected validateScore(score: any, defaultScore: number = 70, min: number = 0, max: number = 100): number {
    console.log(`🔍 [${this.getAnalyzerName()}] validateScore called with:`, {
      score,
      scoreType: typeof score,
      defaultScore
    });

    const numScore = Number(score);
    console.log(`🔍 [${this.getAnalyzerName()}] Number conversion result:`, {
      numScore,
      isNaN: isNaN(numScore)
    });

    if (isNaN(numScore)) {
      console.log(`🔍 [${this.getAnalyzerName()}] Score is NaN, returning default:`, defaultScore);
      return defaultScore;
    }

    const finalScore = Math.max(min, Math.min(max, Math.round(numScore)));
    console.log(`🔍 [${this.getAnalyzerName()}] Final validated score:`, finalScore);
    return finalScore;
  }

  /**
   * Validate sentiment values
   */
  protected validateSentiment(sentiment: any): 'positive' | 'negative' | 'neutral' {
    const validSentiments = ['positive', 'negative', 'neutral'] as const;
    const lowerSentiment = typeof sentiment === 'string' ? sentiment.toLowerCase() : '';

    return validSentiments.includes(lowerSentiment as any)
      ? lowerSentiment as 'positive' | 'negative' | 'neutral'
      : 'neutral';
  }

  /**
   * Parse JSON response from AI with error handling
   */
  protected parseJsonResponse(response: string, fallbackData: any = {}): any {
    try {
      console.log(`🔍 [${this.getAnalyzerName()}] Parsing response, length: ${response.length}`);
      console.log(`🔍 [${this.getAnalyzerName()}] Raw response preview:`, response.substring(0, 300) + '...');

      // Try multiple extraction patterns for JSON
      let jsonMatch;

      // Pattern 1: Standard JSON object (greedy match)
      jsonMatch = response.match(/\{[\s\S]*\}/);

      // Pattern 2: If no match, try finding JSON between code blocks
      if (!jsonMatch) {
        jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          jsonMatch[0] = jsonMatch[1]; // Use the captured group
        }
      }

      // Pattern 3: Try finding JSON between any code blocks
      if (!jsonMatch) {
        jsonMatch = response.match(/```\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          jsonMatch[0] = jsonMatch[1]; // Use the captured group
        }
      }

      if (!jsonMatch) {
        console.error(`❌ [${this.getAnalyzerName()}] No JSON object found in response`);
        console.error(`❌ [${this.getAnalyzerName()}] Full response:`, response);
        throw new Error('No JSON object found in response');
      }

      console.log(`🔍 [${this.getAnalyzerName()}] Found JSON match:`, jsonMatch[0].substring(0, 300) + (jsonMatch[0].length > 300 ? '...' : ''));

      // Clean up the JSON string before parsing
      let cleanJson = jsonMatch[0].trim();

      // Remove any trailing commas before closing braces/brackets
      cleanJson = cleanJson.replace(/,(\s*[}\]])/g, '$1');

      const parsed = JSON.parse(cleanJson);

      console.log(`✅ [${this.getAnalyzerName()}] Successfully parsed JSON with keys:`, Object.keys(parsed));
      console.log(`🔍 [${this.getAnalyzerName()}] Parsed data preview:`, JSON.stringify(parsed, null, 2).substring(0, 500) + '...');

      return parsed;

    } catch (error) {
      console.error(`❌ [${this.getAnalyzerName()}] Failed to parse JSON response:`, error);
      console.error(`❌ [${this.getAnalyzerName()}] Response that failed to parse:`, response.substring(0, 800));
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate text summary from content
   */
  protected generateSummary(text: string, maxSentences: number = 3): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const summary = sentences.slice(0, maxSentences).join('. ').trim();
    return summary || 'Document content analysis pending.';
  }

  /**
   * Extract keywords from text using frequency analysis
   */
  protected extractKeywords(text: string, maxKeywords: number = 20): string[] {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
      'could', 'may', 'might', 'must', 'can', 'shall', 'this', 'that', 'these',
      'those', 'they', 'them', 'their', 'there', 'then', 'than', 'when', 'where'
    ]);

    const words = text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !commonWords.has(word));

    // Count word frequency
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Sort by frequency and return top keywords
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  /**
   * Get the analyzer name for logging (to be implemented by subclasses)
   */
  protected abstract getAnalyzerName(): string;
}
