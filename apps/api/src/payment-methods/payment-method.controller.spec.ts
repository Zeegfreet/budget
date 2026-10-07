import { PaymentMethodController } from './payment-method.controller.js';
import type { PaymentMethodService } from './payment-method.service.js';

describe('PaymentMethodController', () => {
  const service = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    invoice: vi.fn(),
    history: vi.fn(),
    pay: vi.fn(),
    unpay: vi.fn(),
  };
  const controller = new PaymentMethodController(
    service as unknown as PaymentMethodService,
  );
  const user = { id: 7 };

  beforeEach(() => vi.clearAllMocks());

  it('scopes every call by the authenticated user', async () => {
    service.create.mockResolvedValue({ id: 2 });
    const month = { month: '2026-10' };

    await controller.list(user, month);
    await expect(
      controller.create(user, { name: 'Cartão', type: 'CREDIT_CARD' }),
    ).resolves.toEqual({ id: 2 });
    await controller.update(user, 2, { dueDay: 12 });
    await controller.remove(user, 2);
    await controller.invoice(user, 2, month);
    await controller.history(user, 2, { from: '2026-01', to: '2026-12' });
    await controller.pay(user, 2, month);
    await controller.unpay(user, 2, month);

    expect(service.list).toHaveBeenCalledWith(7, '2026-10');
    expect(service.create).toHaveBeenCalledWith(7, {
      name: 'Cartão',
      type: 'CREDIT_CARD',
    });
    expect(service.update).toHaveBeenCalledWith(7, 2, { dueDay: 12 });
    expect(service.remove).toHaveBeenCalledWith(7, 2);
    expect(service.invoice).toHaveBeenCalledWith(7, 2, '2026-10');
    expect(service.history).toHaveBeenCalledWith(7, 2, '2026-01', '2026-12');
    expect(service.pay).toHaveBeenCalledWith(7, 2, '2026-10');
    expect(service.unpay).toHaveBeenCalledWith(7, 2, '2026-10');
  });
});
