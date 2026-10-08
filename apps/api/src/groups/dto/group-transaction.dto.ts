import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  IsPresent,
  MAX_DESCRIPTION_LENGTH,
} from '../../budget/dto/category.dto.js';
import { MAX_AMOUNT_CENTS } from '../../budget/dto/save-lines.dto.js';
import {
  RECURRENCE_SCOPES,
  SeriesPositionDto,
  type RecurrenceScope,
} from '../../budget/dto/transaction.dto.js';
import { MAX_REPEAT_MONTHS, MONTH_PATTERN } from '../../budget/month.js';
import { EntryKind, SplitType } from '../../prisma/generated/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Body of `POST /groups/:id/transactions`. */
export class CreateGroupTransactionDto {
  @ApiProperty({ enum: EntryKind })
  @IsEnum(EntryKind)
  kind: EntryKind;

  @ApiProperty({ example: 'Aluguel', maxLength: MAX_DESCRIPTION_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_DESCRIPTION_LENGTH)
  description: string;

  @ApiProperty({ example: '2026-10', description: 'First (or only) month' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;

  @ApiProperty({ example: 200000, description: 'Integer cents' })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;

  @ApiProperty({
    example: 1,
    description: 'An active split method of the group',
  })
  @IsInt()
  @Min(1)
  splitMethodId: number;

  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description:
      'Member who paid (expense) or received (income); omit while pending. With repeatMonths, only the first month is paid.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paidByMemberId?: number | null;

  @ApiPropertyOptional({ example: 12, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_REPEAT_MONTHS)
  repeatMonths?: number;
}

/**
 * Body of `PATCH /groups/:id/transactions/:txId`. Changing the amount or the
 * split method recomputes the shares.
 */
export class UpdateGroupTransactionDto {
  @ApiPropertyOptional({ enum: EntryKind })
  @IsPresent()
  @IsEnum(EntryKind)
  kind?: EntryKind;

  @ApiPropertyOptional({ example: 'Aluguel' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({ example: 200000 })
  @IsPresent()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsPresent()
  @IsInt()
  @Min(1)
  splitMethodId?: number;

  @ApiPropertyOptional({
    enum: RECURRENCE_SCOPES,
    default: 'ONE',
    description: '`FOLLOWING` also changes the later pending occurrences',
  })
  @IsPresent()
  @IsIn(RECURRENCE_SCOPES)
  scope?: RecurrenceScope;
}

/** Body of `PUT /groups/:id/transactions/:txId/payment`. */
export class PaymentDto {
  @ApiProperty({ example: 1, description: 'Member who paid or received it' })
  @IsInt()
  @Min(1)
  memberId: number;
}

export class TransactionMemberShareDto {
  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ example: 100000 })
  amountCents: number;
}

export class TransactionPayerDto {
  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;
}

export class TransactionSplitMethodDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Igualitário' })
  name: string;

  @ApiProperty({ enum: SplitType })
  type: SplitType;
}

export class GroupTransactionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: EntryKind })
  kind: EntryKind;

  @ApiProperty({ example: 'Aluguel' })
  description: string;

  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ example: 200000 })
  amountCents: number;

  @ApiProperty({
    type: TransactionSplitMethodDto,
    nullable: true,
    description: '`null` once the rule was deleted',
  })
  splitMethod: TransactionSplitMethodDto | null;

  @ApiProperty({
    type: TransactionPayerDto,
    nullable: true,
    description: '`null` while pending',
  })
  paidBy: TransactionPayerDto | null;

  @ApiProperty({ type: SeriesPositionDto, nullable: true })
  series: SeriesPositionDto | null;

  @ApiProperty({
    type: [TransactionMemberShareDto],
    description: 'Adds up to the amount',
  })
  shares: TransactionMemberShareDto[];
}

export class MemberBalanceDto {
  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ description: 'false for former members' })
  active: boolean;

  @ApiProperty({
    example: 60000,
    description: 'Share of expenses minus share of incomes (pending included)',
  })
  shareCents: number;

  @ApiProperty({ example: 200000, description: 'Expenses paid' })
  paidCents: number;

  @ApiProperty({ example: 0, description: 'Incomes received' })
  receivedCents: number;

  @ApiProperty({
    example: 140000,
    description: '> 0: to receive; < 0: owes. Paid items only.',
  })
  netCents: number;
}

export class TransferDto {
  @ApiProperty({ example: 2 })
  fromMemberId: number;

  @ApiProperty({ example: 1 })
  toMemberId: number;

  @ApiProperty({ example: 140000 })
  amountCents: number;
}

export class GroupBalanceDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ example: 0 })
  incomeCents: number;

  @ApiProperty({ example: 200000 })
  expenseCents: number;

  @ApiProperty({ example: 0, description: 'Items nobody paid or received yet' })
  pendingCents: number;

  @ApiProperty({ type: [MemberBalanceDto] })
  members: MemberBalanceDto[];

  @ApiProperty({
    type: [TransferDto],
    description: 'Transfers that settle the month',
  })
  transfers: TransferDto[];
}
