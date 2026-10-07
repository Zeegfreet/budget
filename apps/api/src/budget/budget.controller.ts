import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
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
import { BudgetService } from './budget.service.js';
import {
  BudgetSummaryDto,
  CategoryGroupDto,
  MonthlyEntryDto,
} from './dto/budget-responses.dto.js';
import { InitialBalanceDto } from './dto/initial-balance.dto.js';
import { MonthRangeQueryDto } from './dto/month-range-query.dto.js';
import { SaveEntriesDto } from './dto/save-entries.dto.js';
import { SummaryQueryDto } from './dto/summary-query.dto.js';

@ApiTags('budget')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('categories')
  @ApiOkResponse({ type: [CategoryGroupDto] })
  categories(@CurrentUser() user: JwtUser): Promise<CategoryGroupDto[]> {
    return this.budgetService.categories(user.id);
  }

  @Get('entries')
  @ApiOkResponse({ type: [MonthlyEntryDto] })
  @ApiBadRequestResponse()
  entries(
    @CurrentUser() user: JwtUser,
    @Query() { from, to }: MonthRangeQueryDto,
  ): Promise<MonthlyEntryDto[]> {
    return this.budgetService.entries(user.id, from, to);
  }

  @Put('entries')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse({ description: 'A category is not the user’s' })
  saveEntries(
    @CurrentUser() user: JwtUser,
    @Body() { entries }: SaveEntriesDto,
  ): Promise<void> {
    return this.budgetService.saveEntries(user.id, entries);
  }

  @Get('summary')
  @ApiOkResponse({ type: BudgetSummaryDto })
  @ApiBadRequestResponse()
  summary(
    @CurrentUser() user: JwtUser,
    @Query() { month }: SummaryQueryDto,
  ): Promise<BudgetSummaryDto> {
    return this.budgetService.summary(user.id, month);
  }

  @Put('initial-balance')
  @ApiOkResponse({ type: InitialBalanceDto })
  @ApiBadRequestResponse()
  setInitialBalance(
    @CurrentUser() user: JwtUser,
    @Body() { amountCents }: InitialBalanceDto,
  ): Promise<InitialBalanceDto> {
    return this.budgetService.setInitialBalance(user.id, amountCents);
  }
}
