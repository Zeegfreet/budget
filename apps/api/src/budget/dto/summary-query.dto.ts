import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { MONTH_PATTERN } from '../month.js';

/** The client sends its own current month, since "now" depends on its time zone. */
export class SummaryQueryDto {
  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;
}
