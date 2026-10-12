import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** The only paths the MCP process answers. */
export const isMcpPath = (path: string) =>
  path === '/mcp' || path.startsWith('/.well-known/oauth-protected-resource');

/**
 * HTTP setup of the MCP process, shared by `src/mcp/main.ts` and the e2e
 * tests. The domain modules bring their REST controllers along; everything
 * but `/mcp` and the discovery document is a 404 here.
 */
export function configureMcpApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    (app as NestExpressApplication).set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isMcpPath(req.path)) return next();
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
  });
  app.enableShutdownHooks();
  return app;
}
