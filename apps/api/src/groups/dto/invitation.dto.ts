import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

/** Body of `POST /groups/:id/invitations`. */
export class CreateInvitationDto {
  @ApiProperty({
    example: 'bruno@example.com',
    description: 'E-mail of a registered user',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class InvitationUserDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'Bruno Lima' })
  name: string;

  @ApiProperty({ example: 'bruno@example.com' })
  email: string;
}

export class InvitationGroupDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'República' })
  name: string;
}

/** A pending invitation, as the group's members see it. */
export class GroupInvitationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: InvitationUserDto })
  invitee: InvitationUserDto;

  @ApiProperty({ type: InvitationUserDto })
  inviter: InvitationUserDto;

  @ApiProperty()
  createdAt: Date;
}

/** A pending invitation, as the invitee sees it. */
export class ReceivedInvitationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: InvitationGroupDto })
  group: InvitationGroupDto;

  @ApiProperty({ type: InvitationUserDto })
  inviter: InvitationUserDto;

  @ApiProperty()
  createdAt: Date;
}
