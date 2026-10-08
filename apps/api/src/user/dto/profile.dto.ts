import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { IsPresent } from '../../budget/dto/category.dto.js';
import { IsBirthDate } from '../../auth/validators/birth-date.validator.js';
import { BRAZILIAN_STATES } from '../../auth/validators/brazil.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Sign-up data of the signed-in user (`GET /users/me`). */
export class ProfileDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ana@example.com', description: 'Read-only' })
  email: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ example: '1990-05-20', description: 'YYYY-MM-DD' })
  birthDate: string;

  @ApiProperty({ example: '01001000', description: '8 digits, no mask' })
  cep: string;

  @ApiProperty({ example: 'São Paulo' })
  city: string;

  @ApiProperty({ example: 'SP', enum: BRAZILIAN_STATES })
  state: string;
}

/** The address is one block: sending any of its fields requires all three. */
const hasAddress = (o: UpdateProfileDto) =>
  o.cep !== undefined || o.city !== undefined || o.state !== undefined;

/**
 * Body of `PATCH /users/me`. Mirrors the sign-up rules (`RegisterDto`); the
 * e-mail can't change.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ana Souza' })
  @IsPresent()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({
    example: '1990-05-20',
    description: 'YYYY-MM-DD; must be at least 18',
  })
  @IsPresent()
  @IsBirthDate()
  birthDate?: string;

  @ApiPropertyOptional({
    example: '01001000',
    description: '8 digits, no mask. Requires `city` and `state`',
  })
  @ValidateIf(hasAddress)
  @Matches(/^\d{8}$/, { message: 'cep must have exactly 8 digits' })
  cep?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @ValidateIf(hasAddress)
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional({ example: 'SP', enum: BRAZILIAN_STATES })
  @ValidateIf(hasAddress)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(BRAZILIAN_STATES)
  state?: string;
}
