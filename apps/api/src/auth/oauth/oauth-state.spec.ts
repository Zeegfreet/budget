import { createHash } from 'node:crypto';
import {
  codeChallenge,
  createOAuthState,
  parseOAuthState,
  safeRedirectPath,
  serializeOAuthState,
} from './oauth-state.js';

describe('oauth-state', () => {
  it('creates random state and verifier for each flow', () => {
    const a = createOAuthState('github', '/extrato');
    const b = createOAuthState('github', '/extrato');

    expect(a).toMatchObject({ provider: 'github', redirect: '/extrato' });
    expect(a.state).toMatch(/^[\w-]{43}$/);
    expect(a.verifier).toMatch(/^[\w-]{43}$/);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it('derives the S256 PKCE challenge', () => {
    expect(codeChallenge('verifier')).toBe(
      createHash('sha256').update('verifier').digest('base64url'),
    );
    // RFC 7636 appendix B
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it.each([
    ['/grupos?tab=membros', '/grupos?tab=membros'],
    ['/', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['extrato', '/'],
    [undefined, '/'],
    [['/a', '/b'], '/'],
  ])('safeRedirectPath(%o) = %s', (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it('round-trips the cookie', () => {
    const state = createOAuthState('google', '/x');
    expect(parseOAuthState(serializeOAuthState(state))).toEqual(state);
  });

  it.each([
    undefined,
    'not json',
    'null',
    JSON.stringify({ provider: 'facebook', state: 's', verifier: 'v' }),
    JSON.stringify({ provider: 'github', state: 1, verifier: 'v' }),
  ])('rejects a malformed cookie (%s)', (cookie) => {
    expect(parseOAuthState(cookie)).toBeNull();
  });

  it('sanitizes the saved redirect', () => {
    const cookie = JSON.stringify({
      provider: 'github',
      state: 's',
      verifier: 'v',
      redirect: '//evil.com',
    });
    expect(parseOAuthState(cookie)?.redirect).toBe('/');
  });
});
