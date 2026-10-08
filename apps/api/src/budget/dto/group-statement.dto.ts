import { ApiProperty } from '@nestjs/swagger';
import { EntryKind } from '../../prisma/generated/enums.js';
import {
  SeriesPositionDto,
  TransactionCategoryDto,
} from './transaction.dto.js';

export class StatementGroupRefDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'República' })
  name: string;
}

export class LinkedCategoryDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiProperty({ example: 'Moradia' })
  name: string;
}

export class LinkedPaymentMethodDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'Cartão Americanas' })
  name: string;

  @ApiProperty({ type: Number, nullable: true, example: 12 })
  dueDay: number | null;
}

export class GroupStatementLinkDto {
  @ApiProperty({ type: LinkedCategoryDto, nullable: true })
  expenseCategory: LinkedCategoryDto | null;

  @ApiProperty({ type: LinkedCategoryDto, nullable: true })
  incomeCategory: LinkedCategoryDto | null;

  @ApiProperty({
    type: LinkedPaymentMethodDto,
    nullable: true,
    description: 'Where the expense shares are paid (its invoice shows them)',
  })
  paymentMethod: LinkedPaymentMethodDto | null;
}

/** The user's share of one group transaction. */
export class GroupStatementItemDto {
  @ApiProperty({ example: 10, description: 'Group transaction id' })
  transactionId: number;

  @ApiProperty({ enum: EntryKind })
  kind: EntryKind;

  @ApiProperty({ example: 'Aluguel' })
  description: string;

  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({
    example: 10,
    nullable: true,
    description:
      'Effective due day: for expenses, the linked payment method’s, or else the transaction’s',
  })
  dueDay: number | null;

  @ApiProperty({ example: 150000, description: 'The user’s share' })
  shareCents: number;

  @ApiProperty({ example: 300000, description: 'The transaction’s amount' })
  totalCents: number;

  @ApiProperty({
    description:
      'The user’s share is done: they paid (or received) the item, or whoever received the money confirmed the share',
  })
  paid: boolean;

  @ApiProperty({ description: 'Someone in the group paid (or received) it' })
  groupPaid: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'Ana Souza' })
  paidByName: string | null;

  @ApiProperty({ type: SeriesPositionDto, nullable: true })
  series: SeriesPositionDto | null;

  @ApiProperty({
    type: TransactionCategoryDto,
    nullable: true,
    description:
      'Personal category the share counts in (the link of its kind); `null` = not in the budget',
  })
  category: TransactionCategoryDto | null;
}

export class GroupStatementTransferDto {
  @ApiProperty({ example: 2 })
  fromMemberId: number;

  @ApiProperty({ example: 'Bruno Lima' })
  fromName: string;

  @ApiProperty({ example: 1 })
  toMemberId: number;

  @ApiProperty({ example: 'Ana Souza' })
  toName: string;

  @ApiProperty({ example: 75000 })
  amountCents: number;
}

/** A group's month from the user's point of view. */
export class GroupStatementDto {
  @ApiProperty({ type: StatementGroupRefDto })
  group: StatementGroupRefDto;

  @ApiProperty({
    description:
      'false for a group the user left (listed only while it has their shares in the month)',
  })
  active: boolean;

  @ApiProperty({ example: 1, description: 'The user’s membership id' })
  memberId: number;

  @ApiProperty({ type: GroupStatementLinkDto })
  link: GroupStatementLinkDto;

  @ApiProperty({ example: 300000, description: 'Group expenses in the month' })
  expenseCents: number;

  @ApiProperty({ example: 0, description: 'Group incomes in the month' })
  incomeCents: number;

  @ApiProperty({ description: 'Group items nobody paid or received yet' })
  pendingCents: number;

  @ApiProperty({ example: 150000, description: 'The user’s expense shares' })
  expenseShareCents: number;

  @ApiProperty({ example: 0, description: 'The user’s income shares' })
  incomeShareCents: number;

  @ApiProperty({ description: 'Expenses the user paid' })
  paidCents: number;

  @ApiProperty({ description: 'Incomes the user received' })
  receivedCents: number;

  @ApiProperty({
    description:
      '> 0: the group owes the user; < 0: the user owes the group (paid items only)',
  })
  netCents: number;

  @ApiProperty({
    type: [GroupStatementTransferDto],
    description: 'Suggested transfers the user is part of',
  })
  transfers: GroupStatementTransferDto[];

  @ApiProperty({ type: [GroupStatementItemDto] })
  items: GroupStatementItemDto[];
}
