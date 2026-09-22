import type { Shop } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { CreateShopInput } from './shop.schemas.js';

/**
 * Business logic for shop registration & lookup.
 * Kept free of HTTP concerns so it can be reused/tested independently.
 */
export async function createShop(input: CreateShopInput): Promise<Shop> {
  return prisma.shop.create({
    data: {
      name: input.name,
      address: input.address,
      phone: input.phone,
      secretaryEmail: input.secretaryEmail,
    },
  });
}

export async function getShopById(id: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { id } });
}

export async function getShopByIntakeToken(token: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { intakeToken: token } });
}

export async function listShops(): Promise<Shop[]> {
  return prisma.shop.findMany({ orderBy: { createdAt: 'desc' } });
}

