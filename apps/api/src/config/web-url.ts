import type { ConfigService } from '@nestjs/config';

export const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

/** The web app's origin (`WEB_URL`), used for redirects and e-mail links. */
export function webUrlFrom(config: ConfigService): string {
  return withoutTrailingSlash(
    config.get<string>('WEB_URL') ?? 'http://localhost:5173',
  );
}
