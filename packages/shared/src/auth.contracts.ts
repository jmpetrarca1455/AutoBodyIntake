import { z } from 'zod';

/**
 * Shop portal authentication contracts. Each shop is sold and onboarded
 * independently — signup creates the shop AND its owner login in one step,
 * so a shop can self-serve without any admin involvement.
 */
export const signupSchema = z.object({
  name: z.string().min(1, 'Shop name is required').max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  secretaryEmail: z.string().email('A valid destination email is required'),
  ownerEmail: z.string().email('A valid login email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  ownerEmail: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Multi-user roles per shop. OWNER is the original signup identity; STAFF
 * are additional team members the owner invites. Staff can work the
 * submission inbox but can't change shop settings or manage other staff.
 */
export const shopRole = z.enum(['OWNER', 'STAFF']);
export type ShopRole = z.infer<typeof shopRole>;

export interface AuthResponse {
  token: string;
  shop: {
    id: string;
    name: string;
    ownerEmail: string | null;
  };
  /** The logged-in user's role (OWNER for the shop's own login, STAFF for invited team members). */
  role: ShopRole;
}

/** Owner invites a staff member — email + a temporary password they'll use to log in. */
export const createStaffSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export interface StaffMember {
  id: string;
  email: string;
  role: ShopRole;
  isActive: boolean;
  createdAt: string;
}



