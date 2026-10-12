import { HttpException, HttpStatus } from '@nestjs/common';

/** Error codes of RFC 6749 §5.2 / RFC 7591 §3.2.2 used by this server. */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'invalid_target'
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata';

/** An OAuth error response: `{ error, error_description }` with its status. */
export class OAuthError extends HttpException {
  constructor(
    readonly code: OAuthErrorCode,
    readonly description: string,
    status = code === 'invalid_client'
      ? HttpStatus.UNAUTHORIZED
      : HttpStatus.BAD_REQUEST,
  ) {
    super({ error: code, error_description: description }, status);
  }
}
