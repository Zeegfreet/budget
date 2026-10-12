import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { MCP_SCOPES } from '../scopes.js';

/** Body of `POST /oauth/requests/:id`. */
export class AuthorizationDecisionDto {
  @ApiProperty({ description: 'true allows the agent, false denies it' })
  @IsBoolean()
  approve: boolean;
}

export class AuthorizationRedirectDto {
  @ApiProperty({
    example: 'http://localhost:33418/callback?code=…&state=…',
    description: 'Where the browser goes next (the client)',
  })
  redirectUrl: string;
}

export class NamedClientDto {
  @ApiProperty({ example: 'Claude' })
  name: string;
}

export class AuthorizationRequestDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: NamedClientDto })
  client: NamedClientDto;

  @ApiProperty({
    example: 'claude.ai',
    description: 'Host (or scheme) the code is sent to',
  })
  redirectHost: string;

  @ApiProperty({ enum: MCP_SCOPES, isArray: true })
  scopes: string[];

  @ApiProperty()
  expiresAt: Date;
}

export class GrantDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: NamedClientDto })
  client: NamedClientDto;

  @ApiProperty({ enum: MCP_SCOPES, isArray: true })
  scopes: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  lastUsedAt: Date;
}

export class McpInfoDto {
  @ApiProperty({
    example: 'https://mcp.example.com/mcp',
    description: 'URL to add to an MCP client',
  })
  mcpUrl: string;

  @ApiProperty({ enum: MCP_SCOPES, isArray: true })
  scopes: string[];
}
