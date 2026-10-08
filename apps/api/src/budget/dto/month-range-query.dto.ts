import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { MONTH_PATTERN } from '../month.js';

/** Query of `GET /budget/entries`. Span rules are checked by the service. */
export class MonthRangeQueryDto {
  @ApiProperty({ example: '2026-10', description: 'First month (YYYY-MM)' })
  @Matches(MONTH_PATTERN, { message: 'from must be a month as YYYY-MM' })
  from: string;

  @ApiProperty({
    example: '2027-09',
    description: 'Last month (YYYY-MM), inclusive',
  })
  @Matches(MONTH_PATTERN, { message: 'to must be a month as YYYY-MM' })
  to: string;
}
