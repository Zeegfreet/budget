import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MONTH_PATTERN } from '../month.js';

/** Largest amount accepted for one cell: R$ 1 bilhão */
export const MAX_AMOUNT_CENTS = 100_000_000_000;
export const MAX_CELLS_PER_SAVE = 1000;

export class LineCellDto {
  @ApiProperty({
    example: 12,
    description: 'Any transaction of the line (its `anchorId`)',
  })
  @IsInt()
  @Min(1)
  anchorId: number;

  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;

  @ApiProperty({
    example: 180000,
    description: 'Integer cents; 0 deletes the month’s transaction',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;
}

/** Body of `PUT /budget/lines`: line cells to create, change or clear (0). */
export class SaveLinesDto {
  @ApiProperty({ type: [LineCellDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CELLS_PER_SAVE)
  @ValidateNested({ each: true })
  @Type(() => LineCellDto)
  cells: LineCellDto[];
}
