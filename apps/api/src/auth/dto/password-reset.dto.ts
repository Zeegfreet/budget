import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ResendActivationDto } from './activation.dto.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './register.dto.js';

/** Body of `POST /auth/password/forgot` (an e-mail, like the activation resend). */
export class ForgotPasswordDto extends ResendActivationDto {}

/** Query of `GET /auth/password/reset`. */
export class PasswordResetTokenDto {
  @ApiProperty({ description: 'Secret from the password reset link' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  token: string;
}

/** Body of `POST /auth/password/reset`. Mirrors the web's `validateNewPassword`. */
export class ResetPasswordDto extends PasswordResetTokenDto {
  @ApiProperty({ example: 'novaSenha456', minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}

/** Whose password a reset link sets (`GET /auth/password/reset`). */
export class PasswordResetInfoDto {
  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;
}
