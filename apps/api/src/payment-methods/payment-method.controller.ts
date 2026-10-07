import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator.js';
import { MonthRangeQueryDto } from '../budget/dto/month-range-query.dto.js';
import { TransactionMonthQueryDto } from '../budget/dto/transaction.dto.js';
import {
  CreatePaymentMethodDto,
  InvoiceDto,
  InvoiceMonthDto,
  PaymentMethodDto,
  PaymentMethodSummaryDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto.js';
import { PaymentMethodService } from './payment-method.service.js';

@ApiTags('payment-methods')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(private readonly service: PaymentMethodService) {}

  @Get()
  @ApiOkResponse({
    type: [PaymentMethodSummaryDto],
    description: 'Every method with its invoice of the month',
  })
  list(
    @CurrentUser() user: JwtUser,
    @Query() { month }: TransactionMonthQueryDto,
  ): Promise<PaymentMethodSummaryDto[]> {
    return this.service.list(user.id, month);
  }

  @Post()
  @ApiCreatedResponse({ type: PaymentMethodDto })
  @ApiConflictResponse({ description: 'Name already used' })
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: CreatePaymentMethodDto,
  ): Promise<PaymentMethodDto> {
    return this.service.create(user.id, body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PaymentMethodDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodDto> {
    return this.service.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Its launches keep existing, without a payment method',
  })
  @ApiNotFoundResponse()
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.service.remove(user.id, id);
  }

  @Get(':id/invoice')
  @ApiOkResponse({ type: InvoiceDto })
  @ApiNotFoundResponse()
  invoice(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() { month }: TransactionMonthQueryDto,
  ): Promise<InvoiceDto> {
    return this.service.invoice(user.id, id, month);
  }

  @Get(':id/invoices')
  @ApiOkResponse({
    type: [InvoiceMonthDto],
    description: 'Totals per month (at most 24)',
  })
  @ApiNotFoundResponse()
  history(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() { from, to }: MonthRangeQueryDto,
  ): Promise<InvoiceMonthDto[]> {
    return this.service.history(user.id, id, from, to);
  }

  @Put(':id/invoice/payment')
  @ApiOkResponse({
    type: InvoiceDto,
    description: 'Realizes the pending transactions with their planned amount',
  })
  @ApiNotFoundResponse()
  pay(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() { month }: TransactionMonthQueryDto,
  ): Promise<InvoiceDto> {
    return this.service.pay(user.id, id, month);
  }

  @Delete(':id/invoice/payment')
  @ApiOkResponse({
    type: InvoiceDto,
    description: 'The month’s transactions go back to pending',
  })
  @ApiNotFoundResponse()
  unpay(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() { month }: TransactionMonthQueryDto,
  ): Promise<InvoiceDto> {
    return this.service.unpay(user.id, id, month);
  }
}
