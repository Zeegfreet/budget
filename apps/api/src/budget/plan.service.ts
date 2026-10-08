import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Db } from '../prisma/db.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BudgetService } from './budget.service.js';
import { CategoryService } from './category.service.js';
import type { SavePlanDto } from './dto/save-plan.dto.js';
import { TransactionService } from './transaction.service.js';

/** A plan touching many rows can take longer than Prisma's 5 s default */
const PLAN_TIMEOUT_MS = 30_000;

/** Resolves the client's negative refs to the ids created for them */
class Refs {
  private readonly ids = new Map<number, number>();

  constructor(private readonly kind: string) {}

  set(ref: number, id: number) {
    this.ids.set(ref, id);
  }

  /** A positive id is kept; a negative one must be a ref created before (400 otherwise). */
  resolve(idOrRef: number): number {
    if (idOrRef > 0) return idOrRef;
    const id = this.ids.get(idOrRef);
    if (id === undefined) {
      throw new BadRequestException(`Unknown ${this.kind} reference`);
    }
    return id;
  }
}

/**
 * Saves the dashboard's planning table (`PUT /budget/plan`): types,
 * categories, launches, goals and the grid's values changed together, in one
 * interactive transaction, so a failure leaves nothing saved. The order makes
 * the result match the draft the user saw:
 *
 * 1. categories, then types, deleted (first, so a deleted name can be reused;
 *    the draft drops whatever was under them);
 * 2. types created, then changed (inactivating is left for step 6);
 * 3. categories created, then changed (same);
 * 4. launches created, changed and deleted (`FOLLOWING`);
 * 5. the grid's cells;
 * 6. categories, then types, inactivated (after their values were written).
 *
 * Each step reuses the feature's service, so ownership (404), inactive (400)
 * and name (409) rules are the same as in the single routes.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryService,
    private readonly transactions: TransactionService,
    private readonly budget: BudgetService,
  ) {}

  async save(userId: number, plan: SavePlanDto): Promise<void> {
    try {
      await this.prisma.$transaction((tx) => this.apply(userId, plan, tx), {
        timeout: PLAN_TIMEOUT_MS,
      });
    } catch (error) {
      // A unique violation aborts the interactive transaction: map it here
      if (isUniqueViolation(error)) {
        throw new ConflictException('An item with this name already exists');
      }
      throw error;
    }
  }

  private async apply(
    userId: number,
    plan: SavePlanDto,
    tx: Db,
  ): Promise<void> {
    const groups = new Refs('type');
    const categories = new Refs('category');
    const lines = new Refs('launch');

    for (const id of plan.deleteCategories ?? []) {
      await this.categories.deleteCategory(userId, id, tx);
    }
    for (const id of plan.deleteGroups ?? []) {
      await this.categories.deleteGroup(userId, id, tx);
    }

    for (const { ref, ...input } of plan.createGroups ?? []) {
      const created = await this.categories.createGroup(userId, input, tx);
      groups.set(ref, created.id);
    }
    for (const { id, active, ...patch } of plan.updateGroups ?? []) {
      const change = active === false ? patch : { ...patch, active };
      if (hasFields(change)) {
        await this.categories.updateGroup(userId, id, change, tx);
      }
    }

    for (const { ref, groupId, ...input } of plan.createCategories ?? []) {
      const created = await this.categories.createCategory(
        userId,
        groups.resolve(groupId),
        input,
        tx,
      );
      categories.set(ref, created.id);
    }
    for (const { id, active, ...patch } of plan.updateCategories ?? []) {
      const change = active === false ? patch : { ...patch, active };
      if (hasFields(change)) {
        await this.categories.updateCategory(userId, id, change, tx);
      }
    }

    for (const { ref, categoryId, ...input } of plan.createLines ?? []) {
      const [first] = await this.transactions.create(
        userId,
        { ...input, categoryId: categories.resolve(categoryId) },
        tx,
      );
      // The first occurrence has the lowest id: the line's anchor
      lines.set(ref, first.id);
    }
    for (const { transactionId, categoryId, ...patch } of plan.updateLines ??
      []) {
      await this.transactions.update(
        userId,
        transactionId,
        {
          ...patch,
          ...(categoryId !== undefined
            ? { categoryId: categories.resolve(categoryId) }
            : {}),
          scope: 'FOLLOWING',
        },
        tx,
      );
    }
    for (const transactionId of plan.deleteLines ?? []) {
      await this.transactions.remove(userId, transactionId, 'FOLLOWING', tx);
    }

    const cells = (plan.cells ?? []).map(
      ({ anchorId, month, amountCents }) => ({
        anchorId: lines.resolve(anchorId),
        month,
        amountCents,
      }),
    );
    if (cells.length > 0) await this.budget.saveLines(userId, cells, tx);

    for (const { id, active } of plan.updateCategories ?? []) {
      if (active === false) {
        await this.categories.updateCategory(userId, id, { active }, tx);
      }
    }
    for (const { id, active } of plan.updateGroups ?? []) {
      if (active === false) {
        await this.categories.updateGroup(userId, id, { active }, tx);
      }
    }
  }
}

const hasFields = (patch: object) =>
  Object.values(patch).some((v) => v !== undefined);
