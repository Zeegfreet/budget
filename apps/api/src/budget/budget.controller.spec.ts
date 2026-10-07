import { BudgetController } from './budget.controller.js';
import type { BudgetService } from './budget.service.js';

describe('BudgetController', () => {
  const service = {
    categories: vi.fn(),
    entries: vi.fn(),
    saveEntries: vi.fn(),
    summary: vi.fn(),
    setInitialBalance: vi.fn(),
  };
  const controller = new BudgetController(service as unknown as BudgetService);
  const user = { id: 7 };

  beforeEach(() => vi.clearAllMocks());

  it('scopes every call by the authenticated user', async () => {
    service.categories.mockResolvedValue([]);
    service.entries.mockResolvedValue([]);
    service.summary.mockResolvedValue({ month: '2026-10' });
    service.setInitialBalance.mockResolvedValue({ amountCents: 10 });

    await controller.categories(user);
    await controller.entries(user, { from: '2026-10', to: '2027-09' });
    const entries = [{ categoryId: 1, month: '2026-10', amountCents: 100 }];
    await controller.saveEntries(user, { entries });
    await controller.summary(user, { month: '2026-10' });
    await expect(
      controller.setInitialBalance(user, { amountCents: 10 }),
    ).resolves.toEqual({ amountCents: 10 });

    expect(service.categories).toHaveBeenCalledWith(7);
    expect(service.entries).toHaveBeenCalledWith(7, '2026-10', '2027-09');
    expect(service.saveEntries).toHaveBeenCalledWith(7, entries);
    expect(service.summary).toHaveBeenCalledWith(7, '2026-10');
    expect(service.setInitialBalance).toHaveBeenCalledWith(7, 10);
  });
});
