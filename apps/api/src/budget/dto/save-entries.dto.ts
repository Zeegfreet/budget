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
export const MAX_ENTRIES_PER_SAVE = 1000;

export class EntryDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  categoryId: number;

  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;

  @ApiProperty({
    example: 180000,
    description: 'Integer cents; 0 clears the cell',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;
}

/** Body of `PUT /budget/entries`: cells to create, change or clear (0). */
export class SaveEntriesDto {
  @ApiProperty({ type: [EntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ENTRIES_PER_SAVE)
  @ValidateNested({ each: true })
  @Type(() => EntryDto)
  entries: EntryDto[];
}
