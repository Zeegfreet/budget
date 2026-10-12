import { z } from 'zod';
import {
  CreateTransactionDto,
  RealizationDto,
  RecurrenceScopeQueryDto,
  SeriesEndDto,
  TransactionMonthQueryDto,
  UpdateTransactionDto,
} from '../../budget/dto/transaction.dto.js';
import { cents, defineTool, id, month, type ToolContext } from '../tool.js';
import { validateDto } from '../validate-dto.js';
import type { McpServices } from './services.js';

const scope = z
  .enum(['ONE', 'FOLLOWING'])
  .describe(
    'ONE (default) changes only this occurrence; FOLLOWING also the later, still pending occurrences of its series',
  );
const adjustment = z
  .object({
    percentBp: z
      .number()
      .int()
      .describe('Raise in basis points, 1–10000 (500 = 5%)'),
    everyMonths: z.number().int().describe('Months between raises, 1–60'),
    firstMonth: month(
      'First month raised (default: start + everyMonths)',
    ).optional(),
  })
  .describe(
    'Scheduled raise of a recurring launch, e.g. rent +5% every 12 months',
  );
const description = z
  .string()
  .describe('Short description, up to 120 characters; blank clears it');
const dueDay = z.number().int().describe('Due day of the month, 1–31');
const paymentUrl = z
  .string()
  .describe('Link to the bill or payment portal (absolute http(s) URL)');
const paymentMethodId = z
  .number()
  .int()
  .describe('Payment method (expenses only), from list_payment_methods');

/** Launches of the statement ("lançamentos"): planned, realized, recurring. */
export function registerTransactionTools(ctx: ToolContext, s: McpServices) {
  defineTool(ctx, 'list_transactions', {
    scope: 'budget:read',
    title: 'Lançamentos do mês',
    description:
      'Lists the launches of a month with category (and its type/kind), planned and realized amounts (realizedCents null = pending), due day, payment method and, for recurring launches, the series position and rule.',
    input: { month: month() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, userId) => {
      const { month } = await validateDto(TransactionMonthQueryDto, args);
      return { transactions: await s.transactions.list(userId, month) };
    },
  });

  defineTool(ctx, 'create_transaction', {
    scope: 'budget:write',
    title: 'Criar lançamento',
    description:
      'Plans a launch (income or expense, by its category) in a month. For a recurring one, send repeatMonths (2–60 occurrences) or openEnded: true (every month, no end), optionally with a scheduled adjustment. Returns every occurrence created.',
    input: {
      categoryId: id('category (from get_categories)'),
      month: month('First (or only) month'),
      plannedCents: cents('Planned amount, at least 1'),
      description: description.optional(),
      repeatMonths: z
        .number()
        .int()
        .describe('Occurrences, one per month, 1–60')
        .optional(),
      openEnded: z
        .literal(true)
        .describe('Repeat every month with no end')
        .optional(),
      adjustment: adjustment.optional(),
      dueDay: dueDay.optional(),
      paymentUrl: paymentUrl.optional(),
      paymentMethodId: paymentMethodId.optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (args, userId) => ({
      transactions: await s.transactions.create(
        userId,
        await validateDto(CreateTransactionDto, args),
      ),
    }),
  });

  defineTool(ctx, 'update_transaction', {
    scope: 'budget:write',
    title: 'Alterar lançamento',
    description:
      'Changes a launch: category, description, planned amount, due day, payment link or method (null clears the optional ones). With scope FOLLOWING the change also reaches the later pending occurrences of the series.',
    input: {
      transactionId: id('launch'),
      scope: scope.optional(),
      categoryId: id('new category').optional(),
      description: description.nullable().optional(),
      plannedCents: cents('Planned amount, at least 1').optional(),
      dueDay: dueDay.nullable().optional(),
      paymentUrl: paymentUrl.nullable().optional(),
      paymentMethodId: paymentMethodId.nullable().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ transactionId, ...changes }, userId) => ({
      transaction: await s.transactions.update(
        userId,
        transactionId,
        await validateDto(UpdateTransactionDto, changes),
      ),
    }),
  });

  defineTool(ctx, 'delete_transaction', {
    scope: 'budget:write',
    title: 'Excluir lançamento',
    description:
      'Deletes a launch. With scope FOLLOWING it also deletes the later pending occurrences of its series (and ends an open-ended recurrence there).',
    input: { transactionId: id('launch'), scope: scope.optional() },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async ({ transactionId, ...query }, userId) => {
      const { scope } = await validateDto(RecurrenceScopeQueryDto, query);
      await s.transactions.remove(userId, transactionId, scope);
      return { deleted: true };
    },
  });

  defineTool(ctx, 'set_transaction_realization', {
    scope: 'budget:write',
    title: 'Marcar como pago/recebido',
    description:
      'Records the amount actually paid or received for a launch, or sends it back to pending with realizedCents null.',
    input: {
      transactionId: id('launch'),
      realizedCents: cents(
        'Amount paid/received (0 or more); null = pending',
      ).nullable(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ transactionId, realizedCents }, userId) => {
      const amount =
        realizedCents === null
          ? null
          : (await validateDto(RealizationDto, { amountCents: realizedCents }))
              .amountCents;
      return {
        transaction: await s.transactions.setRealized(
          userId,
          transactionId,
          amount,
        ),
      };
    },
  });

  defineTool(ctx, 'set_series_end', {
    scope: 'budget:write',
    title: 'Alterar fim da recorrência',
    description:
      'Moves the last month of a recurring launch: later months are created as copies of the last occurrence, or pending ones after the new end are deleted (409 if a realized one would go). untilMonth null = no end. adjustment sets (or, with null, removes) the scheduled raise; omit it to keep the current one.',
    input: {
      transactionId: id('any occurrence of the series'),
      untilMonth: month('New last month').nullable(),
      adjustment: adjustment.nullable().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ transactionId, ...body }, userId) => ({
      transactions: await s.transactions.setSeriesEnd(
        userId,
        transactionId,
        await validateDto(SeriesEndDto, body),
      ),
    }),
  });
}
