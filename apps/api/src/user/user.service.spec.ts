import { Test, TestingModule } from '@nestjs/testing';
import { authUserSelect, UserService } from './user.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UserService', () => {
  let service: UserService;
  const prisma = {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('creates a user and returns only public fields', async () => {
    const data = {
      name: 'Ana Souza',
      email: 'ana@example.com',
      passwordHash: 'hash',
      birthDate: new Date('1990-05-20T00:00:00Z'),
      cep: '01001000',
      city: 'São Paulo',
      state: 'SP',
    };
    prisma.user.create.mockResolvedValue({
      id: 1,
      email: data.email,
      name: data.name,
    });

    await expect(service.create(data)).resolves.toEqual({
      id: 1,
      email: 'ana@example.com',
      name: 'Ana Souza',
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data,
      select: authUserSelect,
    });
  });

  it('finds the public view by a normalized e-mail', async () => {
    const user = {
      id: 2,
      email: 'bia@example.com',
      name: 'Bia',
      pending: false,
    };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      service.findPublicByEmail('  Bia@Example.com '),
    ).resolves.toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'bia@example.com' },
      select: { ...authUserSelect, pending: true },
    });
  });

  it('pre-registers an e-mail with a nickname', async () => {
    prisma.user.create.mockResolvedValue({ id: 3 });

    await service.createPending(' Caio@Example.com', 'Caio');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'caio@example.com', name: 'Caio', pending: true },
      select: authUserSelect,
    });
  });

  it('claims only a pre-registration', async () => {
    const data = { name: 'Caio Lima', passwordHash: 'hash' };
    prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.claimPending('caio@example.com', data),
    ).resolves.toBeNull();
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'caio@example.com', pending: true },
      data: { ...data, pending: false },
    });

    prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 3 });
    await expect(
      service.claimPending('caio@example.com', data),
    ).resolves.toEqual({ id: 3 });
  });

  it('finds the full record by e-mail', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findByEmail('ana@example.com')).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ana@example.com' },
    });
  });

  it('finds the public view by id', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'a@b.c',
      name: 'A',
    });

    await expect(service.findById(1)).resolves.toEqual({
      id: 1,
      email: 'a@b.c',
      name: 'A',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: authUserSelect,
    });
  });
});
