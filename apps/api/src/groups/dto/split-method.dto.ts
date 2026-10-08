import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsPresent, MAX_NAME_LENGTH } from '../../budget/dto/category.dto.js';
import { MAX_AMOUNT_CENTS } from '../../budget/dto/save-lines.dto.js';
import { SplitType } from '../../prisma/generated/enums.js';

/** Most participants a rule may name. */
export const MAX_RULE_SHARES = 50;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SplitShareInputDto {
  @ApiProperty({ example: 1, description: 'Membership id' })
  @IsInt()
  @Min(1)
  memberId: number;

  @ApiPropertyOptional({
    example: 3000,
    description:
      'PERCENT: basis points (30% = 3000); WEIGHT: weight; FIXED: cents. Ignored for EQUAL.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  value?: number;
}

/** Body of `POST /groups/:id/split-methods`. */
export class CreateSplitMethodDto {
  @ApiProperty({ example: 'Aluguel 30/70', maxLength: MAX_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name: string;

  @ApiProperty({ enum: SplitType })
  @IsEnum(SplitType)
  type: SplitType;

  @ApiProperty({
    type: [SplitShareInputDto],
    description:
      'Participants; an EQUAL rule without any splits among all members',
  })
  @IsArray()
  @ArrayMaxSize(MAX_RULE_SHARES)
  @ValidateNested({ each: true })
  @Type(() => SplitShareInputDto)
  shares: SplitShareInputDto[];
}

/** Body of `PATCH /groups/:id/split-methods/:methodId`. */
export class UpdateSplitMethodDto {
  @ApiPropertyOptional({ example: 'Aluguel 30/70' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({ enum: SplitType })
  @IsPresent()
  @IsEnum(SplitType)
  type?: SplitType;

  @ApiPropertyOptional({
    type: [SplitShareInputDto],
    description:
      'Replaces the participants; a valid set turns the rule back on',
  })
  @IsPresent()
  @IsArray()
  @ArrayMaxSize(MAX_RULE_SHARES)
  @ValidateNested({ each: true })
  @Type(() => SplitShareInputDto)
  shares?: SplitShareInputDto[];
}

export class SplitShareDto {
  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiProperty({ example: 3000 })
  value: number;
}

export class SplitMethodDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Igualitário' })
  name: string;

  @ApiProperty({ enum: SplitType })
  type: SplitType;

  @ApiProperty({
    description: 'Off when a member it names left; can’t be used until edited',
  })
  active: boolean;

  @ApiProperty({ type: [SplitShareDto] })
  shares: SplitShareDto[];
}
