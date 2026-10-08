import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { RegisterDto } from './register.dto.js';

/** `POST /auth/activation` body and `GET /auth/activation` query. */
export class ActivationTokenDto {
  @ApiProperty({ description: 'Secret from the activation link' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  token: string;
}

/**
 * Body of `POST /auth/activation/signup`: the sign-up data (the e-mail comes
 * from the link) that finishes a pre-registration.
 */
export class CompleteSignupDto extends OmitType(RegisterDto, ['email']) {
  @ApiProperty({ description: 'Secret from the activation link' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  token: string;
}

/** Body of `POST /auth/activation/resend`. */
export class ResendActivationDto {
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export const ACTIVATION_KINDS = ['ACTIVATE', 'COMPLETE_SIGNUP'] as const;
export type ActivationKind = (typeof ACTIVATION_KINDS)[number];

/** What an activation link is for (`GET /auth/activation`). */
export class ActivationInfoDto {
  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({
    example: 'Ana Souza',
    description: 'For a pre-registration, the nickname given by the inviter',
  })
  name: string;

  @ApiProperty({
    enum: ACTIVATION_KINDS,
    description:
      '`ACTIVATE`: a sign-up, `POST /auth/activation`; `COMPLETE_SIGNUP`: a pre-registration, `POST /auth/activation/signup`',
  })
  kind: ActivationKind;
}

/** Answer of `POST /auth/register` (no session until the activation). */
export class RegisterResultDto {
  @ApiProperty({
    example: 'ana@example.com',
    description: 'Where the activation link was sent',
  })
  email: string;
}
