import { z } from 'zod';

const variableKey = z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'variable keys must match ^[A-Z_][A-Z0-9_]*$')
  .refine(k => !k.startsWith('CI_') && !k.startsWith('GITLAB_'), 'CI_* and GITLAB_* variables are reserved');

export const variablesSchema = z.array(z.object({ key: variableKey, value: z.string().max(4096) })).max(20).default([]);
export const createPipelineSchema = z.object({ ref: z.string().min(1).max(255), variables: variablesSchema });
export const playJobSchema = z.object({ variables: variablesSchema });
export const idParam = z.coerce.number().int().positive();
export const refQuery = z.object({ ref: z.string().min(1).max(255) });
