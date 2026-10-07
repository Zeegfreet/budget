import { CategoryController } from './category.controller.js';
import type { CategoryService } from './category.service.js';

describe('CategoryController', () => {
  const service = {
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
  const controller = new CategoryController(
    service as unknown as CategoryService,
  );
  const user = { id: 7 };

  beforeEach(() => vi.clearAllMocks());

  it('scopes every call by the authenticated user', async () => {
    service.createGroup.mockResolvedValue({ id: 3 });

    await expect(
      controller.createGroup(user, { kind: 'EXPENSE', name: 'Lazer' }),
    ).resolves.toEqual({ id: 3 });
    await controller.updateGroup(user, 3, { active: false });
    await controller.deleteGroup(user, 3);
    await controller.createCategory(user, 3, { name: 'Cinema' });
    await controller.updateCategory(user, 11, { dueDay: null });
    await controller.deleteCategory(user, 11);

    expect(service.createGroup).toHaveBeenCalledWith(7, {
      kind: 'EXPENSE',
      name: 'Lazer',
    });
    expect(service.updateGroup).toHaveBeenCalledWith(7, 3, { active: false });
    expect(service.deleteGroup).toHaveBeenCalledWith(7, 3);
    expect(service.createCategory).toHaveBeenCalledWith(7, 3, {
      name: 'Cinema',
    });
    expect(service.updateCategory).toHaveBeenCalledWith(7, 11, {
      dueDay: null,
    });
    expect(service.deleteCategory).toHaveBeenCalledWith(7, 11);
  });
});
