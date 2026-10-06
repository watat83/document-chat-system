import { AnthropicAdapter } from '../anthropic-adapter';
import { cacheManager } from '@/lib/cache';

// Mock cache manager
jest.mock('@/lib/cache', () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('AnthropicAdapter - Models API Integration', () => {
  let adapter: AnthropicAdapter;
  const mockApiKey = 'test-key';

  beforeEach(() => {
    adapter = new AnthropicAdapter({ apiKey: mockApiKey });
    jest.resetAllMocks();
  });

  describe('fetchModelsFromAPI', () => {
    it('should fetch models from Anthropic API successfully', async () => {
      const mockApiResponse = {
        object: 'list',
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3.5 Sonnet',
            type: 'text'
          },
          {
            id: 'claude-3-opus-20240229',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3 Opus',
            type: 'text'
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });

      const models = await adapter.loadAvailableModels();

      expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        displayName: 'Claude 3.5 Sonnet',
        tier: 'balanced',
        maxTokens: 200000
      });
      expect(models[1]).toMatchObject({
        name: 'claude-3-opus-20240229',
        provider: 'anthropic',
        displayName: 'Claude 3 Opus',
        tier: 'powerful',
        maxTokens: 200000
      });
    });

    it('should handle API errors gracefully and fall back to cached models', async () => {
      const cachedModels = [
        {
          name: 'claude-3-sonnet-20240229',
          provider: 'anthropic',
          displayName: 'Claude 3 Sonnet',
          tier: 'balanced',
          maxTokens: 200000,
          costPer1KTokens: { prompt: 0.003, completion: 0.015 },
          averageLatency: 1200,
          qualityScore: 0.92
        }
      ];

      (fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
      (cacheManager.get as jest.Mock).mockResolvedValueOnce(cachedModels);

      const models = await adapter.loadAvailableModels();

      expect(models).toEqual(cachedModels);
    });

    it('should fall back to hardcoded models when API and cache fail', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
      (cacheManager.get as jest.Mock).mockResolvedValueOnce(null);

      const models = await adapter.loadAvailableModels();

      expect(models).toHaveLength(4); // Should have 4 fallback models
      expect(models.find(m => m.name === 'claude-3-5-sonnet-20241022')).toBeDefined();
      expect(models.find(m => m.name === 'claude-3-opus-20240229')).toBeDefined();
      expect(models.find(m => m.name === 'claude-3-sonnet-20240229')).toBeDefined();
      expect(models.find(m => m.name === 'claude-3-haiku-20240307')).toBeDefined();
    });

    it('should cache successful API responses', async () => {
      const mockApiResponse = {
        object: 'list',
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3.5 Sonnet',
            type: 'text'
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });

      await adapter.loadAvailableModels();

      expect(cacheManager.set).toHaveBeenCalledWith(
        'ai:anthropic:models',
        expect.any(Array),
        86400 // 24 hours
      );
    });
  });

  describe('model transformation', () => {
    it('should correctly identify model tiers', async () => {
      const mockApiResponse = {
        object: 'list',
        data: [
          {
            id: 'claude-3-haiku-20240307',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3 Haiku',
            type: 'text'
          },
          {
            id: 'claude-3-sonnet-20240229',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3 Sonnet',
            type: 'text'
          },
          {
            id: 'claude-3-opus-20240229',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3 Opus',
            type: 'text'
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });

      const models = await adapter.loadAvailableModels();

      const haikuModel = models.find(m => m.name.includes('haiku'));
      const sonnetModel = models.find(m => m.name.includes('sonnet'));
      const opusModel = models.find(m => m.name.includes('opus'));

      expect(haikuModel?.tier).toBe('fast');
      expect(sonnetModel?.tier).toBe('balanced');
      expect(opusModel?.tier).toBe('powerful');
    });

    it('should assign correct features to models', async () => {
      const mockApiResponse = {
        object: 'list',
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3.5 Sonnet',
            type: 'text'
          },
          {
            id: 'claude-3-haiku-20240307',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3 Haiku',
            type: 'text'
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });

      const models = await adapter.loadAvailableModels();

      const sonnetModel = models.find(m => m.name.includes('3-5-sonnet'));
      const haikuModel = models.find(m => m.name.includes('haiku'));

      expect(sonnetModel?.features).toContain('vision');
      expect(sonnetModel?.features).toContain('function-calling');
      expect(haikuModel?.features).not.toContain('function-calling');
    });
  });

  describe('caching behavior', () => {
    it('should return cached models when available and not expired', async () => {
      const cachedModels = [
        {
          name: 'claude-3-sonnet-20240229',
          provider: 'anthropic',
          displayName: 'Claude 3 Sonnet',
          tier: 'balanced',
          maxTokens: 200000,
          costPer1KTokens: { prompt: 0.003, completion: 0.015 },
          averageLatency: 1200,
          qualityScore: 0.92
        }
      ];

      (cacheManager.get as jest.Mock).mockResolvedValueOnce(cachedModels);

      const models = await adapter.loadAvailableModels();

      expect(models).toEqual(cachedModels);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should refresh models when explicitly requested', async () => {
      const mockApiResponse = {
        object: 'list',
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            object: 'model',
            created: 1700000000,
            owned_by: 'anthropic',
            display_name: 'Claude 3.5 Sonnet',
            type: 'text'
          }
        ]
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });

      await adapter.refreshModels();

      expect(cacheManager.delete).toHaveBeenCalledWith('ai:anthropic:models');
      expect(fetch).toHaveBeenCalled();
    });
  });
});
