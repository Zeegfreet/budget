import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EntryKind, PaymentMethodType } from '../../prisma/generated/enums.js';
import { MAX_REPEAT_MONTHS, MONTH_PATTERN } from '../month.js';
import {
  IsPresent,
  MAX_DESCRIPTION_LENGTH,
  trimToNull,
} from './category.dto.js';
import { IsPaymentUrl } from './payment-url.js';
import { MAX_AMOUNT_CENTS } from './save-lines.dto.js';

/** Which occurrences of a recurring transaction a change applies to. */
export const RECURRENCE_SCOPES = ['ONE', 'FOLLOWING'] as const;
export type RecurrenceScope = (typeof RECURRENCE_SCOPES)[number];

/** Query of `GET /budget/transactions`. */
export class TransactionMonthQueryDto {
  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;
}

/** Scheduled adjustment of a recurring launch (e.g. +5% every 12 months). */
export class AdjustmentDto {
  @ApiProperty({
    example: 500,
    description: 'Raise in basis points (500 = 5%), 1–10000',
  })
  @IsInt()
  @Min(1)
  @Max(10_000)
  percentBp: number;

  @ApiProperty({ example: 12, description: 'Months between adjustments' })
  @IsInt()
  @Min(1)
  @Max(MAX_REPEAT_MONTHS)
  everyMonths: number;

  @ApiPropertyOptional({
    example: '2027-03',
    description:
      'First month adjusted (default: the first occurrence plus `everyMonths`)',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'firstMonth must be a month as YYYY-MM' })
  firstMonth?: string;
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
    example: true,
    description:
      'Repeats every month with no end (occurrences are created ahead as months are read); not with `repeatMonths`',
  })
  @IsOptional()
  @Equals(true, { message: 'openEnded must be true when sent' })
  openEnded?: boolean;

  @ApiPropertyOptional({
    type: AdjustmentDto,
    description:
      'Scheduled adjustment of a recurring launch (`repeatMonths > 1` or `openEnded`)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdjustmentDto)
  adjustment?: AdjustmentDto;

  @ApiPropertyOptional({
    example: 10,
    description: 'Due day of the month (1–31), repeated in every occurrence',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number | null;

  @IsPaymentUrl()
  paymentUrl?: string | null;

  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description:
      'Own active payment method (expenses only); its due day overrides the launch’s',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paymentMethodId?: number | null;
}

/** Body of `PATCH /budget/transactions/:id`. `null` clears an optional field. */
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
    example: 10,
    nullable: true,
    description: 'Due day of the month (1–31); `null` removes it',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number | null;

  @IsPaymentUrl()
  paymentUrl?: string | null;

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

/** Body of `PUT /budget/transactions/:id/series` (and of the group's). */
export class SeriesEndDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '2027-09',
    description:
      'New last month: later months are created (copies of the last occurrence) or their pending occurrences deleted; `null` = no end',
  })
  @ValidateIf((o: SeriesEndDto) => o.untilMonth !== null)
  @Matches(MONTH_PATTERN, { message: 'untilMonth must be a month as YYYY-MM' })
  untilMonth: string | null;

  @ApiPropertyOptional({
    type: AdjustmentDto,
    nullable: true,
    description:
      'Scheduled adjustment; omitted keeps it, `null` removes it. Changing it recalculates the pending occurrences after the current month',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdjustmentDto)
  adjustment?: AdjustmentDto | null;
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

export class AdjustmentInfoDto {
  @ApiProperty({ example: 500 })
  percentBp: number;

  @ApiProperty({ example: 12 })
  everyMonths: number;

  @ApiProperty({ example: '2027-03' })
  firstMonth: string;
}

export class SeriesRecurrenceDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Last month; `null` = no end',
  })
  endMonth: string | null;

  @ApiProperty({ type: AdjustmentInfoDto, nullable: true })
  adjustment: AdjustmentInfoDto | null;
}

export class SeriesPositionDto {
  @ApiProperty({ example: 3, description: '1-based position by month' })
  index: number;

  @ApiProperty({ example: 12, description: 'Occurrences in the series' })
  count: number;

  @ApiProperty({ example: '2026-10', description: 'Month of the first one' })
  firstMonth: string;

  @ApiProperty({
    example: '2027-09',
    description: 'Month of the last one (created so far, when it has no end)',
  })
  lastMonth: string;

  @ApiProperty({
    type: SeriesRecurrenceDto,
    nullable: true,
    description:
      'Rule of a series with no end or a scheduled adjustment; `null` for a plain series',
  })
  recurrence: SeriesRecurrenceDto | null;
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
      'Effective due day: the payment method’s, or else the launch’s own',
  })
  dueDay: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 10,
    description: 'The launch’s own due day (what the form edits)',
  })
  ownDueDay: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://www.exemplo.com.br/boleto/123',
    description: 'Link to the bill or payment portal',
  })
  paymentUrl: string | null;
}
