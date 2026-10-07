import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client.js';
import type { SplitType } from '../prisma/generated/enums.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSplitMethodDto,
  SplitMethodDto,
  SplitShareInputDto,
  UpdateSplitMethodDto,
} from './dto/split-method.dto.js';
import { activeMembers, assertMember } from './group-access.js';
import { SplitRuleError, validateRule } from './split.js';

export const splitMethodSelect = {
  id: true,
  name: true,
  type: true,
  active: true,
  shares: {
    orderBy: { memberId: 'asc' },
    select: { memberId: true, value: true },
  },
} satisfies Prisma.SplitMethodSelect;

/**
 * The group's split rules. Any active member manages them. Rules may only name
 * active members; their values must divide an amount (e.g. 100% in total).
 */
@Injectable()
export class SplitMethodService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number, groupId: number): Promise<SplitMethodDto[]> {
    await assertMember(this.prisma, userId, groupId);
    return this.prisma.splitMethod.findMany({
      where: { groupId },
      orderBy: { id: 'asc' },
      select: splitMethodSelect,
    });
  }

  async create(
    userId: number,
    groupId: number,
    { name, type, shares }: CreateSplitMethodDto,
  ): Promise<SplitMethodDto> {
    await assertMember(this.prisma, userId, groupId);
    const values = await this.checkShares(groupId, type, shares);
    return this.unique(
      this.prisma.splitMethod.create({
        data: { groupId, name, type, shares: { create: values } },
        select: splitMethodSelect,
      }),
    );
  }

  /** Changing the type or the participants revalidates the rule and turns it on. */
  async update(
    userId: number,
    groupId: number,
    id: number,
    { name, type, shares }: UpdateSplitMethodDto,
  ): Promise<SplitMethodDto> {
    await assertMember(this.prisma, userId, groupId);
    const current = await this.find(groupId, id);
    if (type === undefined && shares === undefined) {
      return this.unique(
        this.prisma.splitMethod.update({
          where: { id },
          data: { name },
          select: splitMethodSelect,
        }),
      );
    }
    const values = await this.checkShares(
      groupId,
      type ?? current.type,
      shares ?? current.shares,
    );
    return this.unique(
      this.prisma.splitMethod.update({
        where: { id },
        data: {
          name,
          type,
          active: true,
          shares: { deleteMany: {}, create: values },
        },
        select: splitMethodSelect,
      }),
    );
  }

  /** Transactions that used the rule keep their shares. */
  async remove(userId: number, groupId: number, id: number): Promise<void> {
    await assertMember(this.prisma, userId, groupId);
    await this.find(groupId, id);
    await this.prisma.splitMethod.delete({ where: { id } });
  }

  private async find(groupId: number, id: number) {
    const method = await this.prisma.splitMethod.findFirst({
      where: { id, groupId },
      select: splitMethodSelect,
    });
    if (!method) throw new NotFoundException('Split method not found');
    return method;
  }

  /** Validated `{ memberId, value }` rows (EQUAL stores 1 for each participant). */
  private async checkShares(
    groupId: number,
    type: SplitType,
    shares: SplitShareInputDto[],
  ): Promise<{ memberId: number; value: number }[]> {
    const values = shares.map((s) => ({
      memberId: s.memberId,
      value: type === 'EQUAL' ? 1 : (s.value ?? 0),
    }));
    try {
      validateRule({ type, shares: values });
    } catch (error) {
      if (error instanceof SplitRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const active = new Set(
      (await activeMembers(this.prisma, groupId)).map((m) => m.id),
    );
    if (values.some((v) => !active.has(v.memberId))) {
      throw new BadRequestException(
        'Every participant must be an active member',
      );
    }
    return values;
  }

  private async unique<T>(query: Promise<T>): Promise<T> {
    try {
      return await query;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A split method with this name already exists',
        );
      }
      throw error;
    }
  }
}
