import { z } from 'zod';

/**
 * Request/response contracts for the shops module.
 * Zod schemas double as runtime validation and TS types.
 */
export const createShopSchema = z.object({
  name: z.string().min(1, 'Shop name is required').max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  secretaryEmail: z.string().email('A valid destination email is required'),
});

export type CreateShopInput = z.infer<typeof createShopSchema>;

export const shopParamsSchema = z.object({
  id: z.string().min(1),
});

export const intakeTokenParamsSchema = z.object({
  token: z.string().min(1),
});

