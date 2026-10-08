import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { mailOf, tokenFrom } from './mail.js';
import { createTestApp, resetDatabase, userBody } from './utils.js';

/**
 * Single Docker image: the API under /api (API_PREFIX) and the web build
 * (WEB_DIST_DIR) on every other path.
 */
describe('Web app + API prefix (e2e)', () => {
  let app: INestApplication<App>;
  let webDir: string;
  const saved = {
    API_PREFIX: process.env.API_PREFIX,
    WEB_DIST_DIR: process.env.WEB_DIST_DIR,
  };

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), 'budget-web-'));
    writeFileSync(
      join(webDir, 'index.html'),
      '<!doctype html><title>Budget</title>',
    );
    mkdirSync(join(webDir, 'assets'));
    writeFileSync(join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(webDir, 'favicon.svg'), '<svg/>');
    process.env.API_PREFIX = 'api';
    process.env.WEB_DIST_DIR = webDir;
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(webDir, { recursive: true, force: true });
  });

  it.each(['/', '/grupos', '/extrato?month=2026-01', '/auth/me'])(
    'serves index.html for the page %s',
    async (path) => {
      const res = await http().get(path).expect(200);
      expect(res.text).toContain('<title>Budget</title>');
      expect(res.get('Cache-Control')).toBe('no-cache');
    },
  );

  it('serves the hashed bundles with a long cache', async () => {
    const res = await http().get('/assets/app-abc123.js').expect(200);
    expect(res.text).toBe('console.log(1)');
    expect(res.get('Cache-Control')).toContain('immutable');
  });

  it('serves other static files without a long cache', async () => {
    const res = await http().get('/favicon.svg').expect(200);
    expect(res.get('Cache-Control')).toBe('no-cache');
  });

  it('answers 404 for a missing bundle instead of the page', async () => {
    await http().get('/assets/missing.js').expect(404);
  });

  it('serves the API under /api', async () => {
    await http().get('/api').expect(200);
    await http().get('/api/auth/me').expect(401);
  });

  it('keeps the API 404 for unknown /api routes', async () => {
    const res = await http().get('/api/unknown').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404 });
  });

  it('does not answer API writes outside /api', async () => {
    await http().post('/auth/login').send({}).expect(404);
  });

  it('scopes the refresh cookie to /api/auth and refreshes through it', async () => {
    const client = request.agent(app.getHttpServer());
    const body = userBody('Ana Souza', 'ana@example.com');
    await client.post('/api/auth/register').send(body).expect(201);
    const token = tokenFrom(mailOf(app).lastTo(body.email));
    const res = await client
      .post('/api/auth/activation')
      .send({ token })
      .expect(200);

    const refresh = (res.get('Set-Cookie') ?? []).find((c) =>
      c.startsWith('refresh_token='),
    );
    expect(refresh).toMatch(/Path=\/api\/auth/);

    await client.get('/api/users/me').expect(200);
    const refreshed = await client.post('/api/auth/refresh').expect(200);
    expect(refreshed.body).toMatchObject({ email: 'ana@example.com' });
    await client.post('/api/auth/logout').expect(204);
    await client.get('/api/users/me').expect(401);
  });
});
