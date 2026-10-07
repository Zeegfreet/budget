import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator.js';
import {
  CreateInvitationDto,
  GroupInvitationDto,
  ReceivedInvitationDto,
} from './dto/invitation.dto.js';
import { InvitationService } from './invitation.service.js';

/** Pending invitations of a group, managed by its members. */
@ApiTags('groups')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@Controller('groups/:groupId/invitations')
export class GroupInvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Get()
  @ApiOkResponse({ type: [GroupInvitationDto] })
  @ApiNotFoundResponse()
  list(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
  ): Promise<GroupInvitationDto[]> {
    return this.invitationService.listForGroup(user.id, groupId);
  }

  @Post()
  @ApiCreatedResponse({ type: GroupInvitationDto })
  @ApiNotFoundResponse({ description: 'Group not found or no such user' })
  @ApiConflictResponse({ description: 'Already a member or already invited' })
  invite(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() { email }: CreateInvitationDto,
  ): Promise<GroupInvitationDto> {
    return this.invitationService.invite(user.id, groupId, email);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  cancel(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.invitationService.cancel(user.id, groupId, id);
  }
}

/** Invitations the current user received. */
@ApiTags('groups')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Get()
  @ApiOkResponse({ type: [ReceivedInvitationDto] })
  list(@CurrentUser() user: JwtUser): Promise<ReceivedInvitationDto[]> {
    return this.invitationService.listReceived(user.id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The user joined the group' })
  @ApiNotFoundResponse()
  accept(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.invitationService.accept(user.id, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  decline(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.invitationService.decline(user.id, id);
  }
}
