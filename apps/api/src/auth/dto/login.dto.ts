import { ApiProperty } from '@nestjs/swagger';

/** Body of `POST /auth/login`, read by the local strategy (documentation only). */
export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ example: 'segredo123' })
  password: string;
}
