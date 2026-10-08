import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentMethodController } from './payment-method.controller.js';
import { PaymentMethodService } from './payment-method.service.js';

@Module({
  imports: [PrismaModule, BudgetModule],
  controllers: [PaymentMethodController],
  providers: [PaymentMethodService],
})
export class PaymentMethodsModule {}
