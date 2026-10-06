import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

describe('UserController', () => {
  let controller: UserController;
  const userService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates create to the service', async () => {
    const dto = { name: 'John Doe', email: 'john@doe.com' };
    await controller.create(dto);

    expect(userService.create).toHaveBeenCalledWith(dto);
  });

  it('converts the id param to a number', async () => {
    await controller.findOne('7');
    await controller.update('7', { name: 'Jane' });
    await controller.remove('7');

    expect(userService.findOne).toHaveBeenCalledWith(7);
    expect(userService.update).toHaveBeenCalledWith(7, { name: 'Jane' });
    expect(userService.remove).toHaveBeenCalledWith(7);
  });
});
