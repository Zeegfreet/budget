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
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { EntryKind } from '../../prisma/generated/enums.js';

export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 120;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Blank text clears the field */
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
/** Optional but, when sent, never `null` (unlike `@IsOptional`) */
const IsPresent = () =>
  ValidateIf((_object, value: unknown) => value !== undefined);

/** Body of `POST /budget/groups`. */
export class CreateGroupDto {
  @ApiProperty({ enum: EntryKind })
  @IsEnum(EntryKind)
  kind: EntryKind;

  @ApiProperty({ example: 'Investimentos', maxLength: MAX_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Share of the income, in percent. Expense types only.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  goalPercent?: number | null;
}

/** Body of `PATCH /budget/groups/:id`. The kind can't change. */
export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Investimentos' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({ description: 'false hides the type (keeps values)' })
  @IsPresent()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    example: 50,
    nullable: true,
    description: '`null` removes the goal. Expense types only.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  goalPercent?: number | null;
}

/** Body of `POST /budget/groups/:id/categories`. */
export class CreateCategoryDto {
  @ApiProperty({ example: 'Aluguel', maxLength: MAX_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: 'Apartamento do centro',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ example: 10, description: 'Due day of the month' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number | null;
}

/** Body of `PATCH /budget/categories/:id`. `null` clears an optional field. */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Aluguel' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: 'Apartamento do centro', nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ example: 10, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number | null;

  @ApiPropertyOptional({
    description: 'false hides the category (keeps values)',
  })
  @IsPresent()
  @IsBoolean()
  active?: boolean;
}
