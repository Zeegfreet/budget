import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { categorySelect, groupSelect } from './budget.service.js';
import type {
  CategoryDto,
  CategoryGroupDto,
} from './dto/budget-responses.dto.js';
import type {
  CreateCategoryDto,
  CreateGroupDto,
  UpdateCategoryDto,
  UpdateGroupDto,
} from './dto/category.dto.js';

/**
 * Edits the category tree: types (`CategoryGroup`) and their categories.
 * The Receitas/Despesas level is the fixed `EntryKind`. Everything is scoped by
 * the owner; another user's item is a 404. Deleting removes its values too.
 */
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(
    userId: number,
    { kind, name, goalPercent }: CreateGroupDto,
  ): Promise<CategoryGroupDto> {
    if (goalPercent != null && kind !== 'EXPENSE') {
      throw new BadRequestException('Only expense types can have a goal');
    }
    const last = await this.prisma.categoryGroup.aggregate({
      where: { userId, kind },
      _max: { position: true },
    });
    return this.unique(
      this.prisma.categoryGroup.create({
        data: {
          userId,
          kind,
          name,
          goalPercent: goalPercent ?? null,
          position: (last._max.position ?? -1) + 1,
        },
        select: groupSelect,
      }),
    );
  }

  async updateGroup(
    userId: number,
    id: number,
    { name, active, goalPercent }: UpdateGroupDto,
  ): Promise<CategoryGroupDto> {
    const group = await this.findGroup(userId, id);
    if (goalPercent != null && group.kind !== 'EXPENSE') {
      throw new BadRequestException('Only expense types can have a goal');
    }
    return this.unique(
      this.prisma.categoryGroup.update({
        where: { id },
        data: { name, active, goalPercent },
        select: groupSelect,
      }),
    );
  }

  async deleteGroup(userId: number, id: number): Promise<void> {
    await this.findGroup(userId, id);
    // Categories and their values go with it (onDelete: Cascade)
    await this.prisma.categoryGroup.delete({ where: { id } });
  }

  async createCategory(
    userId: number,
    groupId: number,
    { name, description, dueDay }: CreateCategoryDto,
  ): Promise<CategoryDto> {
    const group = await this.findGroup(userId, groupId);
    if (!group.active) {
      throw new BadRequestException(
        'Cannot add categories to an inactive type',
      );
    }
    const last = await this.prisma.category.aggregate({
      where: { userId, groupId },
      _max: { position: true },
    });
    return this.unique(
      this.prisma.category.create({
        data: {
          userId,
          groupId,
          name,
          description: description ?? null,
          dueDay: dueDay ?? null,
          position: (last._max.position ?? -1) + 1,
        },
        select: categorySelect,
      }),
    );
  }

  async updateCategory(
    userId: number,
    id: number,
    { name, description, dueDay, active }: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    await this.findCategory(userId, id);
    return this.unique(
      this.prisma.category.update({
        where: { id },
        // `undefined` leaves a field as is, `null` clears it
        data: { name, description, dueDay, active },
        select: categorySelect,
      }),
    );
  }

  async deleteCategory(userId: number, id: number): Promise<void> {
    await this.findCategory(userId, id);
    await this.prisma.category.delete({ where: { id } });
  }

  private async findGroup(userId: number, id: number) {
    const group = await this.prisma.categoryGroup.findFirst({
      where: { id, userId },
      select: { kind: true, active: true },
    });
    if (!group) throw new NotFoundException('Type not found');
    return group;
  }

  private async findCategory(userId: number, id: number) {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** Maps a duplicate name (unique constraint) to 409. */
  private async unique<T>(write: Promise<T>): Promise<T> {
    try {
      return await write;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An item with this name already exists');
      }
      throw error;
    }
  }
}
