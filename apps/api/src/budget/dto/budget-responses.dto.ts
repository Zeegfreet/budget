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

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Apartamento do centro',
  })
  description: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 10 })
  dueDay: number | null;
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
    description: 'Transactions in the cell; with more than one it is read-only',
  })
  count: number;
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
