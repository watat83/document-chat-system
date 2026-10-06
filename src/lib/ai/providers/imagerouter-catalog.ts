import { z } from 'zod';
import type { ImageRouterModel } from '../interfaces/imagerouter-types';

const architectureSchema = z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) });
const pricingSchema = z.object({ min: z.number().finite().nonnegative(), average: z.number().finite().nonnegative(), max: z.number().finite().nonnegative() })
  .refine(pricing => pricing.min <= pricing.average && pricing.average <= pricing.max, 'Invalid price range');
const mediaModelSchema = z.object({ id: z.string().min(1), architecture: architectureSchema, pricing: pricingSchema,
  supported_parameters: z.array(z.string()), parameters: z.object({ size: z.array(z.string()).optional(), seconds: z.array(z.union([z.string(), z.number()])).optional() }).optional() });

/** ImageRouter v3 mixes text token rates and media generation rates. */
export function parseImageRouterCatalog(value: unknown): ImageRouterModel[] {
  const entries = z.array(z.object({ architecture: architectureSchema }).passthrough()).parse(value);
  return entries.filter(entry => entry.architecture.output_modalities.some(modality => modality === 'image' || modality === 'video')).map(entry => {
    const model = mediaModelSchema.parse(entry);
    return { ...model, type: model.architecture.output_modalities.includes('video') ? 'video' : 'image',
      features: [...model.supported_parameters, ...(model.architecture.input_modalities.includes('image') ? ['edit'] : [])] };
  });
}
