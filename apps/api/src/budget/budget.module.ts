import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';
import { TransactionController } from './transaction.controller.js';
import { TransactionService } from './transaction.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BudgetController, CategoryController, TransactionController],
  providers: [BudgetService, CategoryService, TransactionService],
})
export class BudgetModule {}
