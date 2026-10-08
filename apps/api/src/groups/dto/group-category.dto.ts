import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, Length } from 'class-validator';
import { IsPresent, MAX_NAME_LENGTH } from '../../budget/dto/category.dto.js';
import { EntryKind } from '../../prisma/generated/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Body of `POST /groups/:id/categories`. */
export class CreateGroupCategoryDto {
  @ApiProperty({ enum: EntryKind })
  @IsEnum(EntryKind)
  kind: EntryKind;

  @ApiProperty({ example: 'Aluguel', maxLength: MAX_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name: string;
}

/** Body of `PATCH /groups/:id/categories/:categoryId` (the kind is fixed). */
export class UpdateGroupCategoryDto {
  @ApiPropertyOptional({ example: 'Aluguel' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    description: 'false keeps it out of new launches (history stays)',
  })
  @IsPresent()
  @IsBoolean()
  active?: boolean;
}

export class GroupCategoryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: EntryKind })
  kind: EntryKind;

  @ApiProperty({ example: 'Aluguel' })
  name: string;

  @ApiProperty()
  active: boolean;
}

/** A group category as a launch or a statement item references it. */
export class GroupCategoryRefDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Aluguel' })
  name: string;
}
