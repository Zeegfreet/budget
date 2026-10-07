import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BRAZILIAN_STATES } from '../validators/brazil.js';
import { IsBirthDate } from '../validators/birth-date.validator.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Body of `POST /auth/register`. Mirrors the web's `validateRegister`. */
export class RegisterDto {
  @ApiProperty({ example: 'Ana Souza' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'segredo123', minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;

  @ApiProperty({
    example: '1990-05-20',
    description: 'YYYY-MM-DD; must be at least 18',
  })
  @IsBirthDate()
  birthDate: string;

  @ApiProperty({ example: '01001000', description: '8 digits, no mask' })
  @Matches(/^\d{8}$/, { message: 'cep must have exactly 8 digits' })
  cep: string;

  @ApiProperty({ example: 'São Paulo' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  city: string;

  @ApiProperty({ example: 'SP', enum: BRAZILIAN_STATES })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(BRAZILIAN_STATES)
  state: string;
}
