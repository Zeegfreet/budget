import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './register.dto.js';

/** Body of `POST /auth/password`. Mirrors the web's `validatePasswordChange`. */
export class ChangePasswordDto {
  @ApiProperty({ example: 'segredo123' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword: string;

  @ApiProperty({ example: 'novaSenha456', minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword: string;
}
