import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UserService', () => {
  let service: UserService;
  const prisma = {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a user', async () => {
    const dto = { name: 'John Doe', email: 'john@doe.com' };
    prisma.user.create.mockResolvedValue({ id: 1, ...dto });

    await expect(service.create(dto)).resolves.toEqual({ id: 1, ...dto });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: dto });
  });

  it('finds all users', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.findAll()).resolves.toEqual([]);
  });

  it('finds one user by id', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne(1)).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('updates a user', async () => {
    await service.update(1, { name: 'Jane' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: 'Jane' },
    });
  });

  it('removes a user', async () => {
    await service.remove(1);

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
