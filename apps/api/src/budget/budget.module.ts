import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RecurrenceModule } from '../recurrence/recurrence.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';
import { GroupStatementController } from './group-statement.controller.js';
import { GroupStatementService } from './group-statement.service.js';
import { PlanService } from './plan.service.js';
import { TransactionController } from './transaction.controller.js';
import { TransactionService } from './transaction.service.js';

@Module({
  imports: [PrismaModule, RecurrenceModule],
  controllers: [
    BudgetController,
    CategoryController,
    TransactionController,
    GroupStatementController,
  ],
  providers: [
    BudgetService,
    CategoryService,
    TransactionService,
    GroupStatementService,
    PlanService,
  ],
  exports: [TransactionService],
})
export class BudgetModule {}
