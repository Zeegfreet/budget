import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/**
 * HTTP setup shared by `main.ts` and the e2e tests, so tests exercise the same
 * pipes and middleware as production.
 */
export function configureApp(app: INestApplication) {
  // Behind a reverse proxy, lets req.ip (rate limiting, sessions) see the client IP
  const trustProxy = app.get(ConfigService).get<string>('TRUST_PROXY');
  if (trustProxy) {
    (app as NestExpressApplication).set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
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
