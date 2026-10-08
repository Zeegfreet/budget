import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { IsPresent, MAX_NAME_LENGTH } from '../../budget/dto/category.dto.js';
import { TransactionDto } from '../../budget/dto/transaction.dto.js';
import { PaymentMethodType } from '../../prisma/generated/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Body of `POST /payment-methods`. */
export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Cartão Americanas', maxLength: MAX_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name: string;

  @ApiProperty({ enum: PaymentMethodType })
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'Day of the month the invoice is due (1–31)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number | null;
}

/** Body of `PATCH /payment-methods/:id`. `null` clears the due day. */
export class UpdatePaymentMethodDto {
  @ApiPropertyOptional({ example: 'Cartão Americanas' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({ enum: PaymentMethodType })
  @IsPresent()
  @IsEnum(PaymentMethodType)
  type?: PaymentMethodType;

  @ApiPropertyOptional({ example: 12, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number | null;

  @ApiPropertyOptional({
    description: 'false keeps it out of new launches (history stays)',
  })
  @IsPresent()
  @IsBoolean()
  active?: boolean;
}

export class PaymentMethodDto {
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

export class InvoiceTotalsDto {
  @ApiProperty({ example: 19000, description: 'Planned plus group shares' })
  plannedCents: number;

  @ApiProperty({ example: 7550, description: 'Realized plus paid shares' })
  realizedCents: number;

  @ApiProperty({ example: 11000, description: 'Still pending' })
  pendingCents: number;

  @ApiProperty({
    example: 18550,
    description: 'Realized amounts, or planned while pending',
  })
  effectiveCents: number;

  @ApiProperty({ example: 4, description: 'Transactions and shares in it' })
  count: number;
}

/** A payment method with its invoice of the requested month. */
export class PaymentMethodSummaryDto extends PaymentMethodDto {
  @ApiProperty({ type: InvoiceTotalsDto })
  invoice: InvoiceTotalsDto;
}

export class InvoiceGroupRefDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'República' })
  name: string;
}

/** The user's share of a group expense paid with the method (read-only here). */
export class InvoiceShareDto {
  @ApiProperty({ example: 10, description: 'Group transaction id' })
  transactionId: number;

  @ApiProperty({ type: InvoiceGroupRefDto })
  group: InvoiceGroupRefDto;

  @ApiProperty({ example: 'Aluguel' })
  description: string;

  @ApiProperty({ example: 150000 })
  shareCents: number;

  @ApiProperty({
    description:
      'The user’s share is paid: they paid the expense, or the payer confirmed receiving it',
  })
  paid: boolean;

  @ApiProperty({ description: 'Someone paid the group expense' })
  groupPaid: boolean;
}

/** `GET /payment-methods/:id/invoice`: the method's launches of a month. */
export class InvoiceDto extends InvoiceTotalsDto {
  @ApiProperty({ type: PaymentMethodDto })
  paymentMethod: PaymentMethodDto;

  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-12',
    description: 'The due day in the month (its last day when shorter)',
  })
  dueDate: string | null;

  @ApiProperty({ type: [TransactionDto] })
  transactions: TransactionDto[];

  @ApiProperty({ type: [InvoiceShareDto] })
  shares: InvoiceShareDto[];
}

/** One month of `GET /payment-methods/:id/invoices`. */
export class InvoiceMonthDto extends InvoiceTotalsDto {
  @ApiProperty({ example: '2026-10' })
  month: string;
}
