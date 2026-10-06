import { parseImageRouterCatalog } from '@/lib/ai/providers/imagerouter-catalog';
const model = { id: 'provider/image', architecture: { input_modalities: ['image'], output_modalities: ['image'] }, pricing: { min: 0, average: 0, max: 0 }, supported_parameters: ['size'], parameters: { size: ['auto'] } };
test('v3 media catalogs preserve zero pricing and edit support while excluding text token rates', () => {
  const catalog = parseImageRouterCatalog([model, { id: 'text', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.001' } }]);
  expect(catalog).toHaveLength(1);
  expect(catalog[0]).toMatchObject({ type: 'image', pricing: { max: 0 }, features: ['size', 'edit'] });
});
test.each([{ ...model, pricing: { min: 0, average: 2, max: 1 } }, { ...model, pricing: undefined }, { ...model, pricing: { min: -1, average: 0, max: 1 } }])('invalid or missing catalog prices fail closed', invalid => {
  expect(() => parseImageRouterCatalog([invalid])).toThrow();
});
test('legacy catalogs are rejected instead of being treated as empty success', () => {
  expect(() => parseImageRouterCatalog({ data: [model] })).toThrow();
});
