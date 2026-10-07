import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IsPresent,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  trimToNull,
} from '../../budget/dto/category.dto.js';
import { MONTH_PATTERN } from '../../budget/month.js';
import { GroupRole } from '../../prisma/generated/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Body of `POST /groups`. */
export class CreateFinanceGroupDto {
  @ApiProperty({ example: 'República', maxLength: MAX_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: 'Apartamento da Rua A',
    maxLength: MAX_DESCRIPTION_LENGTH,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;
}

/** Body of `PATCH /groups/:id`. `null` clears the description. */
export class UpdateFinanceGroupDto {
  @ApiPropertyOptional({ example: 'República' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: 'Apartamento da Rua A', nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;
}

/** Query of the month-scoped group routes. */
export class GroupMonthQueryDto {
  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH_PATTERN, { message: 'month must be a month as YYYY-MM' })
  month: string;
}

export class FinanceGroupSummaryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'República' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: GroupRole, description: 'The current user’s role' })
  role: GroupRole;

  @ApiProperty({ example: 3, description: 'Active members' })
  memberCount: number;
}

export class GroupMemberDto {
  @ApiProperty({ example: 1, description: 'Membership id' })
  id: number;

  @ApiProperty({ example: 7 })
  userId: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ enum: GroupRole })
  role: GroupRole;

  @ApiProperty()
  joinedAt: Date;
}

export class FinanceGroupDto extends FinanceGroupSummaryDto {
  @ApiProperty({ example: 1, description: 'The current user’s membership id' })
  memberId: number;

  @ApiProperty({
    type: [GroupMemberDto],
    description: 'Active members, oldest first',
  })
  members: GroupMemberDto[];
}
