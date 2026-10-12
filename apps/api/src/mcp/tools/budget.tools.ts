import { z } from 'zod';
import { InitialBalanceDto } from '../../budget/dto/initial-balance.dto.js';
import { MonthRangeQueryDto } from '../../budget/dto/month-range-query.dto.js';
import { SaveLinesDto } from '../../budget/dto/save-lines.dto.js';
import { SummaryQueryDto } from '../../budget/dto/summary-query.dto.js';
import { cents, defineTool, month, type ToolContext } from '../tool.js';
import { validateDto } from '../validate-dto.js';
import type { McpServices } from './services.js';

/** The budget grid, the month summary and the opening balance. */
export function registerBudgetTools(ctx: ToolContext, s: McpServices) {
  defineTool(ctx, 'get_budget_summary', {
    scope: 'budget:read',
    title: 'Resumo do mês',
    description:
      'Income, expenses and balances of a month: opening balance (initial balance plus every earlier month), the month totals and the closing balance. Amounts are effective (realized when paid/received, planned otherwise) and include the user’s shares of finance groups.',
    input: { month: month() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, userId) => {
      const { month } = await validateDto(SummaryQueryDto, args);
      return { summary: await s.budget.summary(userId, month) };
    },
  });

  defineTool(ctx, 'get_budget_lines', {
    scope: 'budget:read',
    title: 'Planejamento por mês',
    description:
      'The budget grid for a period of up to 24 months: `lines` has one row per launch (a recurring series or a single launch) with its category and the amount of each month (use a line’s `anchorId` with set_budget_cells), and `entries` the per-category monthly sums (`amountCents`, plus `groupCents` from finance groups).',
    input: {
      from: month('First month'),
      to: month('Last month (inclusive)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, userId) => {
      const { from, to } = await validateDto(MonthRangeQueryDto, args);
      const [lines, entries] = await Promise.all([
        s.budget.lines(userId, from, to),
        s.budget.entries(userId, from, to),
      ]);
      return { lines, entries };
    },
  });

  defineTool(ctx, 'set_budget_cells', {
    scope: 'budget:write',
    title: 'Alterar valores do planejamento',
    description:
      'Sets planned amounts of budget lines, all or nothing: per cell, the line (`anchorId` from get_budget_lines) and the month. An existing month is updated, a missing one is created as a copy of the line, and 0 deletes that month’s launch. Up to 1000 cells.',
    input: {
      cells: z
        .array(
          z.object({
            anchorId: z.number().int().describe('anchorId of the line'),
            month: month(),
            amountCents: cents('Planned amount; 0 deletes the month’s launch'),
          }),
        )
        .describe('Cells to change'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (args, userId) => {
      const { cells } = await validateDto(SaveLinesDto, args);
      await s.budget.saveLines(userId, cells);
      return { saved: cells.length };
    },
  });

  defineTool(ctx, 'set_initial_balance', {
    scope: 'budget:write',
    title: 'Definir saldo inicial',
    description:
      'Sets the balance the user had before the first month of the budget (may be negative). It feeds every opening balance.',
    input: { amountCents: cents('Initial balance') },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (args, userId) => {
      const { amountCents } = await validateDto(InitialBalanceDto, args);
      return {
        initialBalance: await s.budget.setInitialBalance(userId, amountCents),
      };
    },
  });
}
