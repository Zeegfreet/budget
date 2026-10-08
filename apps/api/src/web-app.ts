import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Vite puts the content-hashed bundles here, so they never change. */
const ASSETS_PATH = '/assets/';

/**
 * True for requests the web app answers with `index.html`: page loads (GET or
 * HEAD) outside `/<prefix>`, so the API keeps its own 404s.
 */
export function isWebAppRoute(method: string, path: string, prefix: string) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return path !== `/${prefix}` && !path.startsWith(`/${prefix}/`);
}

/**
 * Serves the web build (`apps/web/dist`) next to the API, which is mounted
 * under `/<prefix>` (single Docker image). Unknown paths fall back to
 * `index.html` so the SPA router handles them.
 */
export function serveWebApp(
  app: NestExpressApplication,
  dir: string,
  prefix: string,
) {
  app.useStaticAssets(dir, {
    index: false,
    setHeaders: (res, path) => {
      const asset = path.startsWith(join(dir, ASSETS_PATH));
      res.setHeader(
        'Cache-Control',
        asset ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  const index = join(dir, 'index.html');
  app.use((req: Request, res: Response, next: NextFunction) => {
    // A missing bundle is a 404, not the page
    if (
      !isWebAppRoute(req.method, req.path, prefix) ||
      req.path.startsWith(ASSETS_PATH)
    ) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
