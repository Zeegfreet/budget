import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({
    description:
      'Signed up with GitHub/Google and must still fill in the birth date and address (`PATCH /users/me`)',
  })
  needsProfile: boolean;

  @ApiProperty({
    description: 'False when the account only signs in with GitHub/Google',
  })
  hasPassword: boolean;
}
