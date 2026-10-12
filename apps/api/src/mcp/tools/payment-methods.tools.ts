import { TransactionMonthQueryDto } from '../../budget/dto/transaction.dto.js';
import { defineTool, month, type ToolContext } from '../tool.js';
import { validateDto } from '../validate-dto.js';
import type { McpServices } from './services.js';

/** Payment methods are read-only for agents. */
export function registerPaymentMethodTools(ctx: ToolContext, s: McpServices) {
  defineTool(ctx, 'list_payment_methods', {
    scope: 'budget:read',
    title: 'Meios de pagamento',
    description:
      'Lists the user’s payment methods (credit cards, accounts, …) with their due day and the invoice totals of the month. Use an id as paymentMethodId of an expense launch.',
    input: { month: month() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, userId) => {
      const { month } = await validateDto(TransactionMonthQueryDto, args);
      return { paymentMethods: await s.paymentMethods.list(userId, month) };
    },
  });
}
