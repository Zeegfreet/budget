import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;
}
