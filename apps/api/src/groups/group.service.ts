import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertWritableCategories } from '../budget/category-access.js';
import { assertUsablePaymentMethod } from '../payment-methods/payment-method-access.js';
import type { EntryKind } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateFinanceGroupDto,
  FinanceGroupDto,
  FinanceGroupSummaryDto,
  GroupLinkDto,
  UpdateFinanceGroupDto,
} from './dto/group.dto.js';
import { assertMember, assertOwner } from './group-access.js';
import { endMembership } from './membership.js';

/** Name of the rule every group starts with: equal split among all members. */
export const DEFAULT_SPLIT_METHOD = 'Igualitário';

/**
 * Finance groups and their members. A group is visible only to its active
 * members (anyone else gets a 404); renaming, deleting and removing members
 * is up to the owner.
 */
@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number): Promise<FinanceGroupSummaryDto[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, leftAt: null },
      orderBy: { group: { name: 'asc' } },
      select: {
        role: true,
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { members: { where: { leftAt: null } } } },
          },
        },
      },
    });
    return memberships.map(({ role, group: { _count, ...group } }) => ({
      ...group,
      role,
      memberCount: _count.members,
    }));
  }

  /** The creator becomes the owner; the group starts with an equal split rule. */
  async create(
    userId: number,
    { name, description }: CreateFinanceGroupDto,
  ): Promise<FinanceGroupDto> {
    const group = await this.prisma.financeGroup.create({
      data: {
        name,
        description: description ?? null,
        members: { create: { userId, role: 'OWNER' } },
        splitMethods: { create: { name: DEFAULT_SPLIT_METHOD, type: 'EQUAL' } },
      },
    });
    return this.get(userId, group.id);
  }

  async get(userId: number, id: number): Promise<FinanceGroupDto> {
    const me = await assertMember(this.prisma, userId, id);
    const group = await this.prisma.financeGroup.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        members: {
          where: { leftAt: null },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: { name: true, email: true, pending: true } },
          },
        },
      },
    });
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      role: me.role,
      memberId: me.id,
      link: {
        expenseCategoryId: me.expenseCategoryId,
        incomeCategoryId: me.incomeCategoryId,
        paymentMethodId: me.paymentMethodId,
      },
      memberCount: group.members.length,
      members: group.members.map(({ user, ...member }) => ({
        ...member,
        ...user,
      })),
    };
  }

  async update(
    userId: number,
    id: number,
    { name, description }: UpdateFinanceGroupDto,
  ): Promise<FinanceGroupDto> {
    await assertOwner(this.prisma, userId, id);
    await this.prisma.financeGroup.update({
      where: { id },
      data: { name, description },
    });
    return this.get(userId, id);
  }

  /**
   * Sets the user's own categories that receive their shares of the group's
   * expenses and incomes in the personal budget (`null` keeps them out).
   * Each must be the user's (404) and of the matching kind (400); a new one
   * must also be active (400), while keeping a now inactive one is fine.
   */
  async setLink(
    userId: number,
    id: number,
    { expenseCategoryId, incomeCategoryId, paymentMethodId }: GroupLinkDto,
  ): Promise<FinanceGroupDto> {
    const me = await assertMember(this.prisma, userId, id);
    // A new method must be the user's and active; keeping an inactive one is fine
    if (
      paymentMethodId !== undefined &&
      paymentMethodId !== null &&
      paymentMethodId !== me.paymentMethodId
    ) {
      await assertUsablePaymentMethod(this.prisma, userId, paymentMethodId);
    }
    const wanted: [number | null, EntryKind][] = [
      [expenseCategoryId, 'EXPENSE'],
      [incomeCategoryId, 'INCOME'],
    ];
    const ids = wanted.flatMap(([categoryId]) =>
      categoryId === null ? [] : [categoryId],
    );
    const current = [me.expenseCategoryId, me.incomeCategoryId];
    await assertWritableCategories(
      this.prisma,
      userId,
      ids.filter((categoryId) => !current.includes(categoryId)),
    );
    const kinds = await this.prisma.category.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true, group: { select: { kind: true } } },
    });
    // Every category, kept ones included, must be the user's
    if (kinds.length !== new Set(ids).size) {
      throw new NotFoundException('Category not found');
    }
    const kindOf = new Map(kinds.map((c) => [c.id, c.group.kind]));
    for (const [categoryId, kind] of wanted) {
      if (categoryId !== null && kindOf.get(categoryId) !== kind) {
        throw new BadRequestException(
          kind === 'EXPENSE'
            ? 'expenseCategoryId must be an expense category'
            : 'incomeCategoryId must be an income category',
        );
      }
    }
    await this.prisma.groupMember.update({
      where: { id: me.id },
      data: { expenseCategoryId, incomeCategoryId, paymentMethodId },
    });
    return this.get(userId, id);
  }

  /** Deletes the group with everything in it. */
  async remove(userId: number, id: number): Promise<void> {
    await assertOwner(this.prisma, userId, id);
    await this.prisma.financeGroup.delete({ where: { id } });
  }

  /** Ends the user's own membership (the last one out deletes the group). */
  async leave(userId: number, id: number): Promise<void> {
    const me = await assertMember(this.prisma, userId, id);
    await endMembership(this.prisma, me);
  }

  /** The owner removes another active member. */
  async removeMember(
    userId: number,
    id: number,
    memberId: number,
  ): Promise<void> {
    const me = await assertOwner(this.prisma, userId, id);
    if (memberId === me.id) {
      throw new BadRequestException(
        'Leave the group instead of removing yourself',
      );
    }
    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, groupId: id, leftAt: null },
    });
    if (!member) throw new NotFoundException('Member not found');
    await endMembership(this.prisma, member);
  }
}
