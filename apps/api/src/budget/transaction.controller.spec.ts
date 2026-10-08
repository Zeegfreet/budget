import { TransactionController } from './transaction.controller.js';
import type { TransactionService } from './transaction.service.js';

describe('TransactionController', () => {
  const service = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setRealized: vi.fn(),
  };
  const controller = new TransactionController(
    service as unknown as TransactionService,
  );
  const user = { id: 7 };

  beforeEach(() => vi.clearAllMocks());

  it('scopes every call by the authenticated user', async () => {
    service.list.mockResolvedValue([]);
    const input = { categoryId: 1, month: '2026-10', plannedCents: 100 };

    await expect(controller.list(user, { month: '2026-10' })).resolves.toEqual(
      [],
    );
    await controller.create(user, input);
    await controller.update(user, 3, { plannedCents: 5, scope: 'FOLLOWING' });
    await controller.remove(user, 3, { scope: 'ONE' });
    await controller.realize(user, 3, { amountCents: 90 });
    await controller.unrealize(user, 3);

    expect(service.list).toHaveBeenCalledWith(7, '2026-10');
    expect(service.create).toHaveBeenCalledWith(7, input);
    expect(service.update).toHaveBeenCalledWith(7, 3, {
      plannedCents: 5,
      scope: 'FOLLOWING',
    });
    expect(service.remove).toHaveBeenCalledWith(7, 3, 'ONE');
    expect(service.setRealized).toHaveBeenNthCalledWith(1, 7, 3, 90);
    expect(service.setRealized).toHaveBeenNthCalledWith(2, 7, 3, null);
  });
});
