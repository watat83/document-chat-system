import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TEXT_MODEL, getFallbackTextModels } from '../../src/lib/ai/fallback-models';

test('fallback text catalog keeps resilient model choices available', () => {
  const models = getFallbackTextModels();
  assert.ok(models.length > 1);
  assert.equal(models[0].name, DEFAULT_TEXT_MODEL);
  assert.equal(DEFAULT_TEXT_MODEL, 'openrouter/auto');
  assert.ok(models.some((model) => model.name === 'openai/gpt-4o-mini'));
  assert.ok(models.some((model) => model.name.startsWith('anthropic/')));
  assert.equal(new Set(models.map((model) => model.name)).size, models.length);

  models[0].features.length = 0;
  assert.ok(getFallbackTextModels()[0].features.length > 0);
});
