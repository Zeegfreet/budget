import { ApiProperty } from '@nestjs/swagger';
import { EntryKind } from '../../prisma/generated/enums.js';

export class CategoryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Moradia' })
  name: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty({ description: 'Inactive categories keep their values' })
  active: boolean;
}

export class CategoryGroupDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: EntryKind })
  kind: EntryKind;

  @ApiProperty({ example: 'Despesas Básicas' })
  name: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty({ description: 'Inactive types keep their values' })
  active: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 50,
    description: 'Share of the income, in percent (expense types)',
  })
  goalPercent: number | null;

  @ApiProperty({ type: [CategoryDto] })
  categories: CategoryDto[];
}

export class MonthlyEntryDto {
  @ApiProperty({ example: 1 })
  categoryId: number;

  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ example: 180000, description: 'Sum of the planned amounts' })
  amountCents: number;

  @ApiProperty({
    example: 1,
    description: 'Transactions in the cell',
  })
  count: number;

  @ApiProperty({
    example: 75000,
    description:
      'The user’s shares of group transactions linked to the category (not in `amountCents`)',
  })
  groupCents: number;
}

export class LinePaymentMethodDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'Cartão Americanas' })
  name: string;

  @ApiProperty({ type: Number, nullable: true, example: 12 })
  dueDay: number | null;
}

export class LineCellValueDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ example: 12 })
  transactionId: number;

  @ApiProperty({ example: 5590 })
  plannedCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`null` while pending',
  })
  realizedCents: number | null;
}

/** A launch row of the grid: one recurring series, or one plain launch. */
export class BudgetLineDto {
  @ApiProperty({
    example: 12,
    description:
      'Lowest transaction id of the line in the range; identifies it when saving',
  })
  anchorId: number;

  @ApiProperty({ example: 3 })
  categoryId: number;

  @ApiProperty({ type: String, nullable: true, example: 'Netflix' })
  description: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 5,
    description: 'The launch’s own due day',
  })
  dueDay: number | null;

  @ApiProperty({ type: LinePaymentMethodDto, nullable: true })
  paymentMethod: LinePaymentMethodDto | null;

  @ApiProperty({
    type: [LineCellValueDto],
    description: 'Months with a transaction',
  })
  cells: LineCellValueDto[];
}

export class BudgetSummaryDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ example: 100000 })
  initialBalanceCents: number;

  @ApiProperty({ description: 'Initial balance + all months before `month`' })
  openingBalanceCents: number;

  @ApiProperty()
  incomeCents: number;

  @ApiProperty()
  expenseCents: number;

  @ApiProperty({ description: 'Income − expenses of `month`' })
  monthBalanceCents: number;

  @ApiProperty({ description: 'Opening balance + month balance' })
  closingBalanceCents: number;
}
