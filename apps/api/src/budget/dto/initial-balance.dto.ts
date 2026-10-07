import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_AMOUNT_CENTS } from './save-entries.dto.js';

/** Body and response of `PUT /budget/initial-balance`. May be negative (debt). */
export class InitialBalanceDto {
  @ApiProperty({ example: 250000, description: 'Integer cents' })
  @IsInt()
  @Min(-MAX_AMOUNT_CENTS)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;
}
