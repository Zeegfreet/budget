import {
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { serveWebApp } from './web-app.js';

/**
 * HTTP setup shared by `main.ts` and the e2e tests, so tests exercise the same
 * pipes and middleware as production.
 */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  // Behind a reverse proxy, lets req.ip (rate limiting, sessions) see the client IP
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    (app as NestExpressApplication).set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  // Single Docker image: the API under /<API_PREFIX> and the web build on the
  // rest (validated in env.validation.ts: WEB_DIST_DIR requires API_PREFIX)
  const prefix = config.get<string>('API_PREFIX');
  if (prefix) {
    // OAuth discovery lives at the origin's root (RFC 8414 §3.1, path inserted)
    app.setGlobalPrefix(prefix, {
      exclude: [{ path: '.well-known/{*path}', method: RequestMethod.GET }],
    });
  }
  const webDir = config.get<string>('WEB_DIST_DIR');
  if (prefix && webDir) {
    serveWebApp(app as NestExpressApplication, webDir, prefix);
  }

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  return app;
}
