import { z } from 'zod';

/**
 * Shop registration & lookup contracts.
 * Shared between the backend (validation) and the customer app (types).
 */
export const createShopSchema = z.object({
  name: z.string().min(1, 'Shop name is required').max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  secretaryEmail: z.string().email('A valid destination email is required'),
});
export type CreateShopInput = z.infer<typeof createShopSchema>;

export const shopParamsSchema = z.object({ id: z.string().min(1) });
export const intakeTokenParamsSchema = z.object({ token: z.string().min(1) });

/** Public-safe shop shape (what a customer sees before submitting). */
export interface PublicShop {
  name: string;
  address: string | null;
  intakeToken: string;
  isActive: boolean;
}

/** Full shop shape (shop-owner/admin view). */
export interface ShopResponse {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  secretaryEmail: string;
  intakeToken: string;
  intakeLink: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

