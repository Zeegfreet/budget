import { isWebAppRoute } from './web-app.js';

describe('isWebAppRoute', () => {
  it.each(['/', '/grupos', '/auth/me', '/apis', '/settings/profile'])(
    'serves the page for GET %s',
    (path) => {
      expect(isWebAppRoute('GET', path, 'api')).toBe(true);
      expect(isWebAppRoute('HEAD', path, 'api')).toBe(true);
    },
  );

  it.each(['/api', '/api/', '/api/auth/me', '/api/docs'])(
    'leaves %s to the API',
    (path) => {
      expect(isWebAppRoute('GET', path, 'api')).toBe(false);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('ignores %s', (method) => {
    expect(isWebAppRoute(method, '/grupos', 'api')).toBe(false);
  });
});
