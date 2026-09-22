import bcrypt from 'bcryptjs';
import type { Shop } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, ValidationError } from '../../core/errors.js';
import type { SignupInput, LoginInput } from './auth.schemas.js';

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

export async function verifyLogin(input: LoginInput): Promise<Shop> {
  const shop = await prisma.shop.findUnique({ where: { ownerEmail: input.ownerEmail } });
  if (!shop || !shop.passwordHash) {
    throw new ValidationError('Invalid email or password.');
  }

  const valid = await bcrypt.compare(input.password, shop.passwordHash);
  if (!valid) {
    throw new ValidationError('Invalid email or password.');
  }
  if (!shop.isActive) {
    throw new ValidationError('This shop account is inactive. Contact support.');
  }
  return shop;
}

export async function getShopForAuth(shopId: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { id: shopId } });
}

