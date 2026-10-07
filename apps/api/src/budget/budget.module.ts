import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
