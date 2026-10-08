import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../prisma/errors.js';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateGroupCategoryDto,
  GroupCategoryDto,
  UpdateGroupCategoryDto,
} from './dto/group-category.dto.js';
import { assertMember } from './group-access.js';

export const groupCategorySelect = {
  id: true,
  kind: true,
  name: true,
  active: true,
} satisfies Prisma.GroupCategorySelect;

/** Order of a group's categories: expenses first, then by name. */
export const groupCategoryOrder: Prisma.GroupCategoryOrderByWithRelationInput[] =
  [{ kind: 'asc' }, { name: 'asc' }, { id: 'asc' }];

/**
 * A group's own categories (one level, by kind). Any active member manages
 * them; deleting one leaves its launches without a category and drops the
 * members' links to it.
 */
@Injectable()
export class GroupCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number, groupId: number): Promise<GroupCategoryDto[]> {
    await assertMember(this.prisma, userId, groupId);
    return this.prisma.groupCategory.findMany({
      where: { groupId },
      orderBy: groupCategoryOrder,
      select: groupCategorySelect,
    });
  }

  async create(
    userId: number,
    groupId: number,
    { kind, name }: CreateGroupCategoryDto,
  ): Promise<GroupCategoryDto> {
    await assertMember(this.prisma, userId, groupId);
    return this.unique(
      this.prisma.groupCategory.create({
        data: { groupId, kind, name },
        select: groupCategorySelect,
      }),
    );
  }

  async update(
    userId: number,
    groupId: number,
    id: number,
    { name, active }: UpdateGroupCategoryDto,
  ): Promise<GroupCategoryDto> {
    await this.find(userId, groupId, id);
    return this.unique(
      this.prisma.groupCategory.update({
        where: { id },
        data: { name, active },
        select: groupCategorySelect,
      }),
    );
  }

  async remove(userId: number, groupId: number, id: number): Promise<void> {
    await this.find(userId, groupId, id);
    await this.prisma.groupCategory.delete({ where: { id } });
  }

  private async find(userId: number, groupId: number, id: number) {
    await assertMember(this.prisma, userId, groupId);
    const category = await this.prisma.groupCategory.findFirst({
      where: { id, groupId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Group category not found');
    return category;
  }

  private async unique<T>(query: Promise<T>): Promise<T> {
    try {
      return await query;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A group category with this name already exists',
        );
      }
      throw error;
    }
  }
}
