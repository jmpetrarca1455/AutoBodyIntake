import bcrypt from 'bcryptjs';
import type { Shop, ShopUser } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import type { SignupInput, LoginInput, CreateStaffInput } from './auth.schemas.js';

const SALT_ROUNDS = 10;

/**
 * Shop portal authentication. Each shop signs up independently (this is a
 * self-serve product sold per-shop) — signup creates the Shop AND its owner
 * login in one step.
 */
export async function signupShop(input: SignupInput): Promise<Shop> {
  const existing = await prisma.shop.findUnique({ where: { ownerEmail: input.ownerEmail } });
  if (existing) {
    throw new ConflictError('An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  return prisma.shop.create({
    data: {
      name: input.name,
      address: input.address,
      phone: input.phone,
      secretaryEmail: input.secretaryEmail,
      ownerEmail: input.ownerEmail,
      passwordHash,
    },
  });
}

export type LoginResult =
  | { role: 'OWNER'; shop: Shop }
  | { role: 'STAFF'; shop: Shop; userId: string };

/**
 * Verify login credentials against either identity: the shop's own OWNER
 * login (Shop.ownerEmail/passwordHash) or an invited STAFF login
 * (ShopUser). Tries owner first since that's the common case.
 */
export async function verifyLogin(input: LoginInput): Promise<LoginResult> {
  const shop = await prisma.shop.findUnique({ where: { ownerEmail: input.ownerEmail } });
  if (shop && shop.passwordHash) {
    const valid = await bcrypt.compare(input.password, shop.passwordHash);
    if (valid) {
      if (!shop.isActive) {
        throw new ValidationError('This shop account is inactive. Contact support.');
      }
      return { role: 'OWNER', shop };
    }
  }

  const staffUser = await prisma.shopUser.findUnique({ where: { email: input.ownerEmail } });
  if (staffUser) {
    const valid = await bcrypt.compare(input.password, staffUser.passwordHash);
    if (valid) {
      if (!staffUser.isActive) {
        throw new ValidationError('This staff account has been deactivated. Contact your shop owner.');
      }
      const staffShop = await prisma.shop.findUnique({ where: { id: staffUser.shopId } });
      if (!staffShop || !staffShop.isActive) {
        throw new ValidationError('This shop account is inactive. Contact support.');
      }
      return { role: 'STAFF', shop: staffShop, userId: staffUser.id };
    }
  }

  throw new ValidationError('Invalid email or password.');
}

export async function getShopForAuth(shopId: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { id: shopId } });
}

// ── Staff management (owner-only) ───────────────────────

/** Invite a staff member. Owner-only; email must be globally unique (like a shop's ownerEmail). */
export async function createStaffUser(shopId: string, input: CreateStaffInput): Promise<ShopUser> {
  const existingShop = await prisma.shop.findUnique({ where: { ownerEmail: input.email } });
  const existingStaff = await prisma.shopUser.findUnique({ where: { email: input.email } });
  if (existingShop || existingStaff) {
    throw new ConflictError('An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  return prisma.shopUser.create({
    data: { shopId, email: input.email, passwordHash, role: 'STAFF' },
  });
}

export async function listStaffUsers(shopId: string): Promise<ShopUser[]> {
  return prisma.shopUser.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
}

/** Deactivate (soft-delete) a staff login. Owner-only, scoped to their own shop. */
export async function deactivateStaffUser(shopId: string, userId: string): Promise<ShopUser> {
  const staff = await prisma.shopUser.findFirst({ where: { id: userId, shopId } });
  if (!staff) {
    throw new NotFoundError('Staff member not found');
  }
  return prisma.shopUser.update({ where: { id: userId }, data: { isActive: false } });
}


