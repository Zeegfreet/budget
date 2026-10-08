import type { Db } from './db.js';
import { runWrites } from './db.js';

describe('runWrites', () => {
  const write = (value: string) => Promise.resolve(value) as never;

  it('sends the writes as one batch without a transaction', async () => {
    const prisma = { $transaction: vi.fn().mockResolvedValue(['a', 'b']) };
    await expect(
      runWrites(prisma, undefined, () => [write('a'), write('b')]),
    ).resolves.toEqual(['a', 'b']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('awaits them one by one inside the caller’s transaction', async () => {
    const prisma = { $transaction: vi.fn() };
    const tx = { tag: 'tx' } as unknown as Db;
    const build = vi.fn(() => [write('a'), write('b')]);

    await expect(runWrites(prisma, tx, build)).resolves.toEqual(['a', 'b']);
    expect(build).toHaveBeenCalledWith(tx);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sends nothing without writes', async () => {
    const prisma = { $transaction: vi.fn() };
    await expect(runWrites(prisma, undefined, () => [])).resolves.toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
