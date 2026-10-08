import type { Prisma } from './generated/client.js';

/**
 * Where a query runs: the `PrismaService` itself or the client of an
 * interactive `$transaction`, so a service method can join a larger one.
 */
export type Db = Prisma.TransactionClient;

/**
 * Runs writes all or nothing: as a batch `$transaction` on their own, or one
 * after the other inside the caller's interactive transaction (`tx`), which
 * already makes them atomic and can't nest a batch. Prisma promises are lazy,
 * so building them runs nothing; with nothing to write, nothing is sent.
 */
export async function runWrites(
  prisma: {
    $transaction(writes: Prisma.PrismaPromise<unknown>[]): Promise<unknown[]>;
  },
  tx: Db | undefined,
  build: (db: Db) => Prisma.PrismaPromise<unknown>[],
): Promise<unknown[]> {
  const writes = build(tx ?? (prisma as unknown as Db));
  if (writes.length === 0) return [];
  if (!tx) return prisma.$transaction(writes);
  const results: unknown[] = [];
  for (const write of writes) results.push(await write);
  return results;
}
