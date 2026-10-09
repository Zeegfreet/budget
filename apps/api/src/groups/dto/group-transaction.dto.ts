import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  IsPresent,
  MAX_DESCRIPTION_LENGTH,
} from '../../budget/dto/category.dto.js';
import { IsPaymentUrl } from '../../budget/dto/payment-url.js';
import { MAX_AMOUNT_CENTS } from '../../budget/dto/save-lines.dto.js';
import {
  AdjustmentDto,
  RECURRENCE_SCOPES,
  SeriesPositionDto,
  type RecurrenceScope,
} from '../../budget/dto/transaction.dto.js';
import { MAX_REPEAT_MONTHS, MONTH_PATTERN } from '../../budget/month.js';
import { EntryKind, SplitType } from '../../prisma/generated/enums.js';
import { GroupCategoryRefDto } from './group-category.dto.js';

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
      'Scheduled adjustment of a recurring launch (`repeatMonths > 1` or `openEnded`); not with a FIXED rule',
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
    example: 3,
    nullable: true,
    description:
      'An active category of the group with the same kind, repeated in every occurrence',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null;
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
    example: 3,
    nullable: true,
    description:
      'A category of the group with the same kind; `null` removes it',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null;

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

/** A member's share of a group transaction. */
export class SettlementTargetDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  transactionId: number;

  @ApiProperty({ example: 2, description: 'The member whose share it is' })
  @IsInt()
  @Min(1)
  memberId: number;
}

/** Most shares one `POST /groups/:id/settlements` may change. */
export const MAX_SETTLEMENT_ITEMS = 100;

/** Body of `POST /groups/:id/settlements`. */
export class SetSettlementDto {
  @ApiProperty({ type: [SettlementTargetDto], maxItems: MAX_SETTLEMENT_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SETTLEMENT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => SettlementTargetDto)
  items: SettlementTargetDto[];

  @ApiProperty({
    example: true,
    description: '`true` confirms the shares were paid back; `false` undoes it',
  })
  @IsBoolean()
  settled: boolean;
}

export class TransactionMemberShareDto {
  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ example: 100000 })
  amountCents: number;

  @ApiProperty({
    description:
      'Whoever receives the money confirmed this share was paid back',
  })
  settled: boolean;
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
    example: 10,
    nullable: true,
    description: 'Day of the month it is due (1–31)',
  })
  dueDay: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://www.exemplo.com.br/boleto/123',
    description: 'Link to the bill or payment portal',
  })
  paymentUrl: string | null;

  @ApiProperty({
    type: GroupCategoryRefDto,
    nullable: true,
    description: 'The group category; `null` without one',
  })
  category: GroupCategoryRefDto | null;

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

/** A share of a paid transaction that one member owes another. */
export class SettlementItemDto {
  @ApiProperty({ example: 1 })
  transactionId: number;

  @ApiProperty({ enum: EntryKind })
  kind: EntryKind;

  @ApiProperty({ example: 'Aluguel' })
  description: string;

  @ApiProperty({ example: 2, description: 'The member whose share it is' })
  memberId: number;

  @ApiProperty({
    example: 1,
    description: 'Who paid the expense or received the income',
  })
  payerMemberId: number;

  @ApiProperty({ example: 100000 })
  amountCents: number;

  @ApiProperty({ description: 'Confirmed as paid back' })
  settled: boolean;

  @ApiProperty({
    description:
      'The user is the one receiving the money (payer of an expense, share member of an income), so they can confirm it',
  })
  canSettle: boolean;
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

  @ApiProperty({
    type: [SettlementItemDto],
    description:
      'Shares of the paid items owed to whoever paid or received them',
  })
  settlements: SettlementItemDto[];
}
