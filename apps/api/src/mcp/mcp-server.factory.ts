import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BudgetService } from '../budget/budget.service.js';
import { CategoryService } from '../budget/category.service.js';
import { currentMonth } from '../budget/month.js';
import { PlanService } from '../budget/plan.service.js';
import { TransactionService } from '../budget/transaction.service.js';
import { PaymentMethodService } from '../payment-methods/payment-method.service.js';
import type { McpPrincipal } from './principal.js';
import type { Authorize } from './tool.js';
import { registerBudgetTools } from './tools/budget.tools.js';
import { registerCategoryTools } from './tools/categories.tools.js';
import { registerGoalTools } from './tools/goals.tools.js';
import { registerPaymentMethodTools } from './tools/payment-methods.tools.js';
import type { McpServices } from './tools/services.js';
import { registerTransactionTools } from './tools/transactions.tools.js';

export const MCP_SERVER_NAME = 'budget';
export const MCP_SERVER_VERSION = '1.0.0';

export interface CreateServerOptions {
  /**
   * Checked before every tool call; defaults to the principal itself (an HTTP
   * request is verified once, by the guard).
   */
  authorize?: Authorize;
}

/** Guidance sent to the agent on `initialize`. */
export function serverInstructions(now = new Date()) {
  return [
    'Personal budget of the signed-in user (Brazilian real).',
    'Money is always integer cents (R$ 1.234,56 = 123456); months are YYYY-MM.',
    `The current month is ${currentMonth(now)}.`,
    'Start with get_categories: income and expense types hold categories, and launches ("lançamentos") belong to a category.',
    'Expense types may have a goal, a share of the income in percent: get_goals shows how they stand, set_goals sets or removes them.',
    'A launch is pending until realized (set_transaction_realization); totals use the realized amount when there is one.',
    'Ask the user before deleting anything; inactivating a type or category keeps its history.',
  ].join('\n');
}

/**
 * Builds an MCP server for one principal, independent of the transport: the
 * HTTP endpoint creates one per request, the stdio process one for its life,
 * and the app may link one in memory (`InMemoryTransport`). Write tools are
 * only registered with `budget:write`.
 */
@Injectable()
export class McpServerFactory {
  private readonly services: McpServices;

  constructor(
    budget: BudgetService,
    categories: CategoryService,
    transactions: TransactionService,
    paymentMethods: PaymentMethodService,
    plan: PlanService,
  ) {
    this.services = { budget, categories, plan, transactions, paymentMethods };
  }

  create(
    principal: McpPrincipal,
    options: CreateServerOptions = {},
  ): McpServer {
    const server = new McpServer(
      { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      { instructions: serverInstructions(), capabilities: { tools: {} } },
    );
    const ctx = {
      server,
      principal,
      authorize: options.authorize ?? (() => Promise.resolve(principal)),
    };
    registerCategoryTools(ctx, this.services);
    registerBudgetTools(ctx, this.services);
    registerGoalTools(ctx, this.services);
    registerTransactionTools(ctx, this.services);
    registerPaymentMethodTools(ctx, this.services);
    return server;
  }
}
