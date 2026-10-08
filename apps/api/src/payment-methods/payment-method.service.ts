import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addMonths, MAX_MONTH_SPAN, monthSpan } from '../budget/month.js';
import { TransactionService } from '../budget/transaction.service.js';
import { isShareSettled } from '../groups/settlement.js';
import type { Prisma } from '../prisma/generated/client.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreatePaymentMethodDto,
  InvoiceDto,
  InvoiceMonthDto,
  InvoiceShareDto,
  PaymentMethodDto,
  PaymentMethodSummaryDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto.js';
import {
  dueDate,
  invoiceTotals,
  type InvoiceShare,
  type InvoiceTransaction,
} from './invoice.js';

export const paymentMethodSelect = {
  id: true,
  name: true,
  type: true,
  dueDay: true,
  active: true,
} satisfies Prisma.PaymentMethodSelect;

/**
 * The user's payment methods (cards, accounts) and their invoices: a month's
 * personal expenses paid with the method plus the user's shares of the group
 * expenses they assigned to it. Everything is scoped by the owner; another
 * user's method is a 404.
 */
@Injectable()
export class PaymentMethodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  /** Every method (inactive ones too), by name, with its invoice of `month`. */
  async list(
    userId: number,
    month: string,
  ): Promise<PaymentMethodSummaryDto[]> {
    const methods = await this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: paymentMethodSelect,
    });
    const { transactions, shares } = await this.items(
      userId,
      methods.map((m) => m.id),
      { equals: month },
    );
    return methods.map((method) => ({
      ...method,
      invoice: invoiceTotals(
        transactions.filter((t) => t.paymentMethodId === method.id),
        shares.filter((s) => s.paymentMethodId === method.id),
      ),
    }));
  }

  async create(
    userId: number,
    { name, type, dueDay }: CreatePaymentMethodDto,
  ): Promise<PaymentMethodDto> {
    return this.unique(
      this.prisma.paymentMethod.create({
        data: { userId, name, type, dueDay: dueDay ?? null },
        select: paymentMethodSelect,
      }),
    );
  }

  async update(
    userId: number,
    id: number,
    { name, type, dueDay, active }: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodDto> {
    await this.find(userId, id);
    return this.unique(
      this.prisma.paymentMethod.update({
        where: { id },
        // `undefined` leaves a field as is, `null` clears the due day
        data: { name, type, dueDay, active },
        select: paymentMethodSelect,
      }),
    );
  }

  /** Its transactions and group links go back to no method (onDelete: SetNull). */
  async remove(userId: number, id: number): Promise<void> {
    await this.find(userId, id);
    await this.prisma.paymentMethod.delete({ where: { id } });
  }

  async invoice(
    userId: number,
    id: number,
    month: string,
  ): Promise<InvoiceDto> {
    const paymentMethod = await this.find(userId, id);
    const [transactions, shares] = await Promise.all([
      this.transactions.listByPaymentMethod(userId, id, month),
      this.shareRows(userId, [id], { equals: month }),
    ]);
    const items: InvoiceShareDto[] = shares.map((s) => ({
      transactionId: s.transaction.id,
      group: s.transaction.group,
      description: s.transaction.description,
      paymentUrl: s.transaction.paymentUrl,
      shareCents: s.amountCents,
      paid: isShareSettled(s.transaction.paidByMemberId, s),
      groupPaid: s.transaction.paidByMemberId !== null,
    }));
    return {
      paymentMethod,
      month,
      dueDate: dueDate(month, paymentMethod.dueDay),
      ...invoiceTotals(transactions, items),
      transactions,
      shares: items,
    };
  }

  /** Totals of every month in `from`..`to` (empty months included). */
  async history(
    userId: number,
    id: number,
    from: string,
    to: string,
  ): Promise<InvoiceMonthDto[]> {
    const span = monthSpan(from, to);
    if (span < 1) throw new BadRequestException('from must not be after to');
    if (span > MAX_MONTH_SPAN) {
      throw new BadRequestException(
        `The range must span at most ${MAX_MONTH_SPAN} months`,
      );
    }
    await this.find(userId, id);
    const { transactions, shares } = await this.items(userId, [id], {
      gte: from,
      lte: to,
    });
    return Array.from({ length: span }, (_, i) => {
      const month = addMonths(from, i);
      return {
        month,
        ...invoiceTotals(
          transactions.filter((t) => t.month === month),
          shares.filter((s) => s.month === month),
        ),
      };
    });
  }

  /**
   * Pays the invoice: every pending transaction of the method in the month is
   * realized with its planned amount. Group shares follow their group.
   */
  async pay(userId: number, id: number, month: string): Promise<InvoiceDto> {
    await this.find(userId, id);
    const pending = await this.prisma.transaction.findMany({
      where: { userId, paymentMethodId: id, month, realizedCents: null },
      select: { id: true, plannedCents: true },
    });
    await this.prisma.$transaction(
      pending.map((t) =>
        this.prisma.transaction.update({
          where: { id: t.id },
          data: { realizedCents: t.plannedCents },
        }),
      ),
    );
    return this.invoice(userId, id, month);
  }

  /** Undoes the payment: the method's transactions of the month go back to pending. */
  async unpay(userId: number, id: number, month: string): Promise<InvoiceDto> {
    await this.find(userId, id);
    await this.prisma.transaction.updateMany({
      where: { userId, paymentMethodId: id, month },
      data: { realizedCents: null },
    });
    return this.invoice(userId, id, month);
  }

  private async find(userId: number, id: number): Promise<PaymentMethodDto> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, userId },
      select: paymentMethodSelect,
    });
    if (!method) throw new NotFoundException('Payment method not found');
    return method;
  }

  /** Transactions and shares of the methods in the months, for the totals. */
  private async items(
    userId: number,
    methodIds: number[],
    month: Prisma.StringFilter,
  ) {
    if (methodIds.length === 0) return { transactions: [], shares: [] };
    const [transactions, shares] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, paymentMethodId: { in: methodIds }, month },
        select: {
          paymentMethodId: true,
          month: true,
          plannedCents: true,
          realizedCents: true,
        },
      }),
      this.shareRows(userId, methodIds, month),
    ]);
    return {
      transactions: transactions as (InvoiceTransaction & {
        paymentMethodId: number;
        month: string;
      })[],
      shares: shares.map(
        (s): InvoiceShare & { paymentMethodId: number; month: string } => ({
          paymentMethodId: s.member.paymentMethodId!,
          month: s.transaction.month,
          shareCents: s.amountCents,
          paid: isShareSettled(s.transaction.paidByMemberId, s),
        }),
      ),
    };
  }

  /**
   * The user's shares of group expenses assigned to the methods. Former
   * memberships count too, so leaving a group doesn't rewrite past invoices.
   * A share is paid once the user paid the item or the payer confirmed it.
   */
  private shareRows(
    userId: number,
    methodIds: number[],
    month: Prisma.StringFilter,
  ) {
    return this.prisma.groupTransactionShare.findMany({
      where: {
        member: { userId, paymentMethodId: { in: methodIds } },
        transaction: { kind: 'EXPENSE', month },
      },
      orderBy: [{ transaction: { month: 'asc' } }, { transactionId: 'asc' }],
      select: {
        amountCents: true,
        memberId: true,
        settledAt: true,
        member: { select: { paymentMethodId: true } },
        transaction: {
          select: {
            id: true,
            month: true,
            description: true,
            paymentUrl: true,
            paidByMemberId: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /** Maps a duplicate name to 409. */
  private async unique<T>(write: Promise<T>): Promise<T> {
    try {
      return await write;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A payment method with this name already exists',
        );
      }
      throw error;
    }
  }
}
