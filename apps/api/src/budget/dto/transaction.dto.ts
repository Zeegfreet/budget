import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EntryKind, PaymentMethodType } from '../../prisma/generated/enums.js';
import { MAX_REPEAT_MONTHS, MONTH_PATTERN } from '../month.js';
import {
  IsPresent,
  MAX_DESCRIPTION_LENGTH,
  trimToNull,
} from './category.dto.js';
import { MAX_AMOUNT_CENTS } from './save-entries.dto.js';

/** Which occurrences of a recurring transaction a change applies to. */
export const RECURRENCE_SCOPES = ['ONE', 'FOLLOWING'] as const;
export type RecurrenceScope = (typeof RECURRENCE_SCOPES)[number];

/** Query of `GET /budget/transactions`. */
export class TransactionMonthQueryDto {
  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;
}

/** Body of `POST /budget/transactions`. */
export class CreateTransactionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  categoryId: number;

  @ApiProperty({ example: '2026-10', description: 'First (or only) month' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;

  @ApiPropertyOptional({
    example: 'Conta de luz',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;

  @ApiProperty({ example: 18000, description: 'Integer cents' })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  plannedCents: number;

  @ApiPropertyOptional({
    example: 12,
    default: 1,
    description: 'Creates one occurrence per month, starting at `month`',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_REPEAT_MONTHS)
  repeatMonths?: number;

  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description:
      'Own active payment method (expenses only); its due day overrides the category’s',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paymentMethodId?: number | null;
}

/** Body of `PATCH /budget/transactions/:id`. `null` clears the description. */
export class UpdateTransactionDto {
  @ApiPropertyOptional({ example: 1 })
  @IsPresent()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ example: 'Conta de luz', nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ example: 18000 })
  @IsPresent()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  plannedCents?: number;

  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description: 'Payment method (expenses only); `null` removes it',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paymentMethodId?: number | null;

  @ApiPropertyOptional({
    enum: RECURRENCE_SCOPES,
    default: 'ONE',
    description:
      '`FOLLOWING` also changes the later pending occurrences of the series',
  })
  @IsPresent()
  @IsIn(RECURRENCE_SCOPES)
  scope?: RecurrenceScope;
}

/** Query of `DELETE /budget/transactions/:id`. */
export class RecurrenceScopeQueryDto {
  @ApiPropertyOptional({
    enum: RECURRENCE_SCOPES,
    default: 'ONE',
    description:
      '`FOLLOWING` also deletes the later pending occurrences of the series',
  })
  @IsOptional()
  @IsIn(RECURRENCE_SCOPES)
  scope?: RecurrenceScope;
}

/** Body of `PUT /budget/transactions/:id/realization`. */
export class RealizationDto {
  @ApiProperty({
    example: 17550,
    description: 'Amount actually paid or received, in integer cents',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;
}

export class TransactionGroupDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Despesas Básicas' })
  name: string;

  @ApiProperty({ enum: EntryKind })
  kind: EntryKind;

  @ApiProperty()
  active: boolean;
}

export class TransactionCategoryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Moradia' })
  name: string;

  @ApiProperty({ type: Number, nullable: true, example: 10 })
  dueDay: number | null;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ type: TransactionGroupDto })
  group: TransactionGroupDto;
}

export class TransactionPaymentMethodDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'Cartão Americanas' })
  name: string;

  @ApiProperty({ enum: PaymentMethodType })
  type: PaymentMethodType;

  @ApiProperty({ type: Number, nullable: true, example: 12 })
  dueDay: number | null;

  @ApiProperty()
  active: boolean;
}

export class SeriesPositionDto {
  @ApiProperty({ example: 3, description: '1-based position by month' })
  index: number;

  @ApiProperty({ example: 12, description: 'Occurrences in the series' })
  count: number;
}

export class TransactionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ type: String, nullable: true, example: 'Conta de luz' })
  description: string | null;

  @ApiProperty({ example: 18000 })
  plannedCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 17550,
    description: '`null` while pending',
  })
  realizedCents: number | null;

  @ApiProperty({ type: SeriesPositionDto, nullable: true })
  series: SeriesPositionDto | null;

  @ApiProperty({ type: TransactionCategoryDto })
  category: TransactionCategoryDto;

  @ApiProperty({ type: TransactionPaymentMethodDto, nullable: true })
  paymentMethod: TransactionPaymentMethodDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 12,
    description:
      'Effective due day: the payment method’s, or else the category’s',
  })
  dueDay: number | null;
}
