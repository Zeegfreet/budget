import { NotFoundException } from '@nestjs/common';
import { UserController } from './user.controller.js';
import type { UserService } from './user.service.js';

describe('UserController', () => {
  const service = { findProfile: vi.fn(), updateProfile: vi.fn() };
  const controller = new UserController(service as unknown as UserService);
  const user = { id: 7 };
  const profile = {
    id: 7,
    email: 'ana@example.com',
    name: 'Ana Souza',
    birthDate: '1990-05-20',
    cep: '01001000',
    city: 'São Paulo',
    state: 'SP',
  };

  beforeEach(() => vi.clearAllMocks());

  it('reads and updates the authenticated user only', async () => {
    service.findProfile.mockResolvedValue(profile);
    service.updateProfile.mockResolvedValue({ ...profile, name: 'Ana' });

    await expect(controller.profile(user)).resolves.toEqual(profile);
    await expect(
      controller.update(user, { name: 'Ana' }),
    ).resolves.toMatchObject({ name: 'Ana' });

    expect(service.findProfile).toHaveBeenCalledWith(7);
    expect(service.updateProfile).toHaveBeenCalledWith(7, { name: 'Ana' });
  });

  it('throws 404 when the user is gone', async () => {
    service.findProfile.mockResolvedValue(null);
    service.updateProfile.mockResolvedValue(null);

    await expect(controller.profile(user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.update(user, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
