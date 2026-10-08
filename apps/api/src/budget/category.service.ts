import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Db } from '../prisma/db.js';
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
 * Every write takes an optional `db` to run inside a larger transaction (the
 * dashboard's plan, see `PlanService`).
 */
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(
    userId: number,
    { kind, name, goalPercent }: CreateGroupDto,
    db: Db = this.prisma,
  ): Promise<CategoryGroupDto> {
    if (goalPercent != null && kind !== 'EXPENSE') {
      throw new BadRequestException('Only expense types can have a goal');
    }
    const last = await db.categoryGroup.aggregate({
      where: { userId, kind },
      _max: { position: true },
    });
    return this.unique(
      db.categoryGroup.create({
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
    db: Db = this.prisma,
  ): Promise<CategoryGroupDto> {
    const group = await this.findGroup(db, userId, id);
    if (goalPercent != null && group.kind !== 'EXPENSE') {
      throw new BadRequestException('Only expense types can have a goal');
    }
    return this.unique(
      db.categoryGroup.update({
        where: { id },
        data: { name, active, goalPercent },
        select: groupSelect,
      }),
    );
  }

  async deleteGroup(
    userId: number,
    id: number,
    db: Db = this.prisma,
  ): Promise<void> {
    await this.findGroup(db, userId, id);
    // Categories and their values go with it (onDelete: Cascade)
    await db.categoryGroup.delete({ where: { id } });
  }

  async createCategory(
    userId: number,
    groupId: number,
    { name }: CreateCategoryDto,
    db: Db = this.prisma,
  ): Promise<CategoryDto> {
    const group = await this.findGroup(db, userId, groupId);
    if (!group.active) {
      throw new BadRequestException(
        'Cannot add categories to an inactive type',
      );
    }
    const last = await db.category.aggregate({
      where: { userId, groupId },
      _max: { position: true },
    });
    return this.unique(
      db.category.create({
        data: {
          userId,
          groupId,
          name,
          position: (last._max.position ?? -1) + 1,
        },
        select: categorySelect,
      }),
    );
  }

  async updateCategory(
    userId: number,
    id: number,
    { name, active }: UpdateCategoryDto,
    db: Db = this.prisma,
  ): Promise<CategoryDto> {
    await this.findCategory(db, userId, id);
    return this.unique(
      db.category.update({
        where: { id },
        data: { name, active },
        select: categorySelect,
      }),
    );
  }

  async deleteCategory(
    userId: number,
    id: number,
    db: Db = this.prisma,
  ): Promise<void> {
    await this.findCategory(db, userId, id);
    await db.category.delete({ where: { id } });
  }

  private async findGroup(db: Db, userId: number, id: number) {
    const group = await db.categoryGroup.findFirst({
      where: { id, userId },
      select: { kind: true, active: true },
    });
    if (!group) throw new NotFoundException('Type not found');
    return group;
  }

  private async findCategory(db: Db, userId: number, id: number) {
    const category = await db.category.findFirst({
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
