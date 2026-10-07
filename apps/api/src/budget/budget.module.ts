import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BudgetController, CategoryController],
  providers: [BudgetService, CategoryService],
})
export class BudgetModule {}
