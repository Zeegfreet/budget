import { z } from 'zod';
import { MonthRangeQueryDto } from '../../budget/dto/month-range-query.dto.js';
import { SetGoalsDto } from '../../budget/dto/set-goals.dto.js';
import { defineTool, id, month, type ToolContext } from '../tool.js';
import { validateDto } from '../validate-dto.js';
import type { McpServices } from './services.js';

/** Goals: the share of the income each expense type may take. */
export function registerGoalTools(ctx: ToolContext, s: McpServices) {
  defineTool(ctx, 'get_goals', {
    scope: 'budget:read',
    title: 'Metas de gastos',
    description:
      'How the goals of the active expense types stand (a goal is a share of the income, in percent). For each type, `month` is the usage in the reference month (`from`) and `period` in the whole window (up to 24 months): `spentCents` (effective amounts plus finance group shares), `incomeCents`, `targetCents` (the goal’s share of the income), `permille` (spent ÷ income in tenths of a percent, null without income) and `status` (ok; warning at 90% of the goal; over). `total` is every goal together; `leftover` is income minus every expense against the minimum left by the goals (100 − totalGoalPercent): below it warns, negative is over.',
    input: {
      from: month('Reference month (first of the window)'),
      to: month(
        'Last month of the window (inclusive); use `from` for one month',
      ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, userId) => {
      const { from, to } = await validateDto(MonthRangeQueryDto, args);
      return { goals: await s.budget.goals(userId, from, to) };
    },
  });

  defineTool(ctx, 'set_goals', {
    scope: 'budget:write',
    title: 'Definir metas',
    description:
      'Sets or removes the goals of expense types, all or nothing: per item, the type (`typeId` from get_categories) and `goalPercent` 1–100 (share of the income) or null to remove it. Types left out keep their goal. 400 for an income type. The goals may add up to more than 100%, but then they take more than the whole income.',
    input: {
      goals: z
        .array(
          z.object({
            typeId: id('expense category type'),
            goalPercent: z
              .number()
              .int()
              .nullable()
              .describe('Share of the income, 1–100 percent; null removes it'),
          }),
        )
        .describe('Goals to change, one per type'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (args, userId) => {
      const { goals } = await validateDto(SetGoalsDto, args);
      await s.plan.save(userId, {
        updateGroups: goals.map(({ typeId, goalPercent }) => ({
          id: typeId,
          goalPercent,
        })),
      });
      const withGoal = (await s.budget.categories(userId))
        .filter((t) => t.kind === 'EXPENSE' && t.goalPercent !== null)
        .map(({ id, name, active, goalPercent }) => ({
          typeId: id,
          name,
          active,
          goalPercent: goalPercent!,
        }));
      const totalGoalPercent = withGoal
        .filter((t) => t.active)
        .reduce((sum, t) => sum + t.goalPercent, 0);
      return {
        goals: withGoal,
        totalGoalPercent,
        ...(totalGoalPercent > 100
          ? {
              warning: `The active goals add up to ${totalGoalPercent}%, more than the whole income`,
            }
          : {}),
      };
    },
  });
}
