import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { MCP_CONFIG, type McpConfig } from '../mcp/mcp.config.js';
import {
  AuthorizationDecisionDto,
  AuthorizationRedirectDto,
  AuthorizationRequestDto,
  GrantDto,
  McpInfoDto,
} from './dto/oauth-server.dto.js';
import {
  type ClientCredentials,
  type ClientRegistration,
  OAuthServerService,
  type TokenResponse,
} from './oauth-server.service.js';
import { MCP_SCOPES } from './scopes.js';

const MINUTE_MS = 60_000;
const REGISTER_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
const TOKEN_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };

type Params = Record<string, unknown>;

/**
 * Client credentials from `Authorization: Basic` (RFC 6749 §2.3.1, values
 * form-encoded) or from the body.
 */
export function clientCredentials(
  body: Params,
  authorization?: string,
): ClientCredentials {
  const basic = /^Basic\s+(.+)$/i.exec(authorization ?? '');
  if (basic) {
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon > 0) {
      const decode = (v: string) => decodeURIComponent(v.replace(/\+/g, ' '));
      try {
        return {
          clientId: decode(decoded.slice(0, colon)),
          clientSecret: decode(decoded.slice(colon + 1)),
        };
      } catch {
        return {};
      }
    }
  }
  const text = (key: string) =>
    typeof body[key] === 'string' ? body[key] : undefined;
  return { clientId: text('client_id'), clientSecret: text('client_secret') };
}

const noStore = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
};

/**
 * OAuth 2.1 authorization server for MCP clients (AI agents). The protocol
 * endpoints are public and answer in the OAuth error format; the consent and
 * connection endpoints need the user's session.
 */
@ApiTags('oauth')
@Controller('oauth')
export class OAuthServerController {
  constructor(
    private readonly oauth: OAuthServerService,
    @Inject(MCP_CONFIG) private readonly config: McpConfig,
  ) {}

  /** The MCP server URL and scopes, for the "Agentes de IA" page. */
  @Public()
  @Get('info')
  @ApiOkResponse({ type: McpInfoDto })
  info(): McpInfoDto {
    return { mcpUrl: this.config.resource, scopes: [...MCP_SCOPES] };
  }

  /** Dynamic Client Registration (RFC 7591). */
  @Public()
  @Throttle(REGISTER_THROTTLE)
  @Post('register')
  @ApiCreatedResponse({ description: 'The registered client (RFC 7591)' })
  @ApiBadRequestResponse({
    description: '`invalid_redirect_uri` or `invalid_client_metadata`',
  })
  @ApiTooManyRequestsResponse()
  register(@Body() body: Params): Promise<ClientRegistration> {
    return this.oauth.register(body ?? {});
  }

  /**
   * Authorization endpoint: sends the browser to the web's consent screen, or
   * back to the client with an error.
   */
  @Public()
  @Throttle(TOKEN_THROTTLE)
  @Get('authorize')
  @ApiFoundResponse({
    description: 'Redirect to the consent screen or the client',
  })
  async authorize(@Query() query: Params, @Res() res: Response) {
    res.redirect(HttpStatus.FOUND, await this.oauth.authorize(query));
  }

  /** Token endpoint: authorization code (with PKCE) and refresh token grants. */
  @Public()
  @Throttle(TOKEN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('token')
  @ApiOkResponse({ description: 'Tokens (RFC 6749 §5.1)' })
  @ApiBadRequestResponse({ description: 'OAuth error (RFC 6749 §5.2)' })
  @ApiUnauthorizedResponse({ description: '`invalid_client`' })
  async token(
    @Body() body: Params,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    noStore(res);
    const params = body ?? {};
    return this.oauth.token(params, clientCredentials(params, authorization));
  }

  /** Token revocation (RFC 7009): always 200 for a known client. */
  @Public()
  @Throttle(TOKEN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: '`invalid_client`' })
  async revoke(
    @Body() body: Params,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<void> {
    const params = body ?? {};
    await this.oauth.revoke(params, clientCredentials(params, authorization));
  }

  /** The pending request the consent screen shows. */
  @Get('requests/:id')
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthorizationRequestDto })
  @ApiNotFoundResponse({ description: 'Unknown, expired or already decided' })
  @ApiUnauthorizedResponse()
  request(@Param('id') id: string): Promise<AuthorizationRequestDto> {
    return this.oauth.findRequest(id);
  }

  /** The signed-in user allows or denies the agent. */
  @Post('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthorizationRedirectDto })
  @ApiNotFoundResponse({ description: 'Unknown, expired or already decided' })
  @ApiUnauthorizedResponse()
  async decide(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() { approve }: AuthorizationDecisionDto,
  ): Promise<AuthorizationRedirectDto> {
    return { redirectUrl: await this.oauth.decide(user.id, id, approve) };
  }

  /** The user's connected agents. */
  @Get('grants')
  @ApiCookieAuth()
  @ApiOkResponse({ type: [GrantDto] })
  @ApiUnauthorizedResponse()
  grants(@CurrentUser() user: JwtUser): Promise<GrantDto[]> {
    return this.oauth.listGrants(user.id);
  }

  /** Disconnects an agent: its tokens stop working at once. */
  @Delete('grants/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  revokeGrant(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.oauth.revokeGrant(user.id, id);
  }
}
