import { Prisma } from './generated/client.js';

/** Prisma `P2002`: a unique constraint rejected the write. */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
