import type { BudgetService } from '../../budget/budget.service.js';
import type { CategoryService } from '../../budget/category.service.js';
import type { PlanService } from '../../budget/plan.service.js';
import type { TransactionService } from '../../budget/transaction.service.js';
import type { PaymentMethodService } from '../../payment-methods/payment-method.service.js';

/** The domain services the tools call (each scopes every query by user). */
export interface McpServices {
  budget: BudgetService;
  categories: CategoryService;
  plan: PlanService;
  transactions: TransactionService;
  paymentMethods: PaymentMethodService;
}
