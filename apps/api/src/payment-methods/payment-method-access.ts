import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Db } from '../prisma/db.js';

/**
 * Ensures the payment method is the user's (404 otherwise, no existence leak)
 * and can take new launches: it is active (400 otherwise).
 */
export async function assertUsablePaymentMethod(
  prisma: Db,
  userId: number,
  id: number,
): Promise<void> {
  const method = await prisma.paymentMethod.findFirst({
    where: { id, userId },
    select: { active: true },
  });
  if (!method) throw new NotFoundException('Payment method not found');
  if (!method.active) {
    throw new BadRequestException('Payment method is inactive');
  }
}
