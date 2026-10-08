import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { InvitationStatus } from '../../prisma/generated/enums.js';

/** Body of `POST /groups/:id/invitations`. */
export class CreateInvitationDto {
  @ApiProperty({
    example: 'bruno@example.com',
    description:
      'E-mail of the person; without an account, they are pre-registered and join right away',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({
    example: 'Bruno',
    minLength: 2,
    maxLength: 100,
    description:
      'Name shown until the person signs up; required when the e-mail has no account, ignored otherwise',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  nickname?: string;
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

export class InvitationInviteeDto extends InvitationUserDto {
  @ApiProperty({
    description: 'Pre-registered (no account yet); `name` is the nickname',
  })
  pending: boolean;
}

/**
 * An invitation, as the group's members see it: `PENDING` until the invitee
 * answers, or `ACCEPTED` right away for a pre-registered person.
 */
export class GroupInvitationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED] })
  status: InvitationStatus;

  @ApiProperty({ type: InvitationInviteeDto })
  invitee: InvitationInviteeDto;

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
