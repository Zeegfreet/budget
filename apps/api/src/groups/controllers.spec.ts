import { GroupTransactionController } from './group-transaction.controller.js';
import type { GroupTransactionService } from './group-transaction.service.js';
import { GroupController } from './group.controller.js';
import type { GroupService } from './group.service.js';
import {
  GroupInvitationController,
  InvitationController,
} from './invitation.controller.js';
import type { InvitationService } from './invitation.service.js';
import { SplitMethodController } from './split-method.controller.js';
import type { SplitMethodService } from './split-method.service.js';

const user = { id: 7 };

describe('group controllers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GroupController scopes every call by the authenticated user', async () => {
    const service = {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      leave: vi.fn(),
      removeMember: vi.fn(),
    };
    const controller = new GroupController(service as unknown as GroupService);

    await controller.list(user);
    await controller.create(user, { name: 'Casa' });
    await controller.get(user, 5);
    await controller.update(user, 5, { name: 'Lar' });
    await controller.remove(user, 5);
    await controller.leave(user, 5);
    await controller.removeMember(user, 5, 2);

    expect(service.list).toHaveBeenCalledWith(7);
    expect(service.create).toHaveBeenCalledWith(7, { name: 'Casa' });
    expect(service.get).toHaveBeenCalledWith(7, 5);
    expect(service.update).toHaveBeenCalledWith(7, 5, { name: 'Lar' });
    expect(service.remove).toHaveBeenCalledWith(7, 5);
    expect(service.leave).toHaveBeenCalledWith(7, 5);
    expect(service.removeMember).toHaveBeenCalledWith(7, 5, 2);
  });

  it('invitation controllers scope every call by the authenticated user', async () => {
    const service = {
      listForGroup: vi.fn(),
      invite: vi.fn(),
      cancel: vi.fn(),
      listReceived: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
    };
    const group = new GroupInvitationController(
      service as unknown as InvitationService,
    );
    const received = new InvitationController(
      service as unknown as InvitationService,
    );

    await group.list(user, 5);
    await group.invite(user, 5, { email: 'b@example.com' });
    await group.cancel(user, 5, 3);
    await received.list(user);
    await received.accept(user, 3);
    await received.decline(user, 4);

    expect(service.listForGroup).toHaveBeenCalledWith(7, 5);
    expect(service.invite).toHaveBeenCalledWith(7, 5, 'b@example.com');
    expect(service.cancel).toHaveBeenCalledWith(7, 5, 3);
    expect(service.listReceived).toHaveBeenCalledWith(7);
    expect(service.accept).toHaveBeenCalledWith(7, 3);
    expect(service.decline).toHaveBeenCalledWith(7, 4);
  });

  it('SplitMethodController scopes every call by the authenticated user', async () => {
    const service = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const controller = new SplitMethodController(
      service as unknown as SplitMethodService,
    );
    const body = { name: 'Todos', type: 'EQUAL' as const, shares: [] };

    await controller.list(user, 5);
    await controller.create(user, 5, body);
    await controller.update(user, 5, 3, { name: 'X' });
    await controller.remove(user, 5, 3);

    expect(service.list).toHaveBeenCalledWith(7, 5);
    expect(service.create).toHaveBeenCalledWith(7, 5, body);
    expect(service.update).toHaveBeenCalledWith(7, 5, 3, { name: 'X' });
    expect(service.remove).toHaveBeenCalledWith(7, 5, 3);
  });

  it('GroupTransactionController scopes every call by the authenticated user', async () => {
    const service = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      setPayment: vi.fn(),
      balance: vi.fn(),
    };
    const controller = new GroupTransactionController(
      service as unknown as GroupTransactionService,
    );
    const body = {
      kind: 'EXPENSE' as const,
      description: 'Luz',
      month: '2026-10',
      amountCents: 100,
      splitMethodId: 1,
    };

    await controller.list(user, 5, { month: '2026-10' });
    await controller.create(user, 5, body);
    await controller.update(user, 5, 3, { scope: 'FOLLOWING' });
    await controller.remove(user, 5, 3, { scope: 'ONE' });
    await controller.pay(user, 5, 3, { memberId: 2 });
    await controller.unpay(user, 5, 3);
    await controller.balance(user, 5, { month: '2026-10' });

    expect(service.list).toHaveBeenCalledWith(7, 5, '2026-10');
    expect(service.create).toHaveBeenCalledWith(7, 5, body);
    expect(service.update).toHaveBeenCalledWith(7, 5, 3, {
      scope: 'FOLLOWING',
    });
    expect(service.remove).toHaveBeenCalledWith(7, 5, 3, 'ONE');
    expect(service.setPayment).toHaveBeenNthCalledWith(1, 7, 5, 3, 2);
    expect(service.setPayment).toHaveBeenNthCalledWith(2, 7, 5, 3, null);
    expect(service.balance).toHaveBeenCalledWith(7, 5, '2026-10');
  });
});
