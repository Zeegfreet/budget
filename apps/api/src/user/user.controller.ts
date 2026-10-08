import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator.js';
import { ProfileDto, UpdateProfileDto } from './dto/profile.dto.js';
import { UserService } from './user.service.js';

/** The signed-in user's own profile. There is no route to other users. */
@ApiTags('users')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  @ApiOkResponse({ type: ProfileDto })
  @ApiNotFoundResponse()
  async profile(@CurrentUser() user: JwtUser): Promise<ProfileDto> {
    const profile = await this.users.findProfile(user.id);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  @Patch('me')
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({
    description: 'Invalid data, or an incomplete address (cep, city, state)',
  })
  @ApiNotFoundResponse()
  async update(
    @CurrentUser() user: JwtUser,
    @Body() body: UpdateProfileDto,
  ): Promise<ProfileDto> {
    const profile = await this.users.updateProfile(user.id, body);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }
}
