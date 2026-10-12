import {
  isAllowedRedirectUri,
  matchRedirectUri,
  withParams,
} from './redirect-uri.js';

describe('isAllowedRedirectUri', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'http://localhost:33418/callback',
    'http://127.0.0.1/callback',
    'http://[::1]:8080/cb',
    'cursor://anysphere.cursor-retrieval/oauth/callback',
    'com.example.app:/oauth',
  ])('accepts %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true);
  });

  it.each([
    'http://example.com/cb',
    'https://example.com/cb#fragment',
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'not a url',
    42,
    `https://example.com/${'a'.repeat(2000)}`,
  ])('rejects %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });
});

describe('matchRedirectUri', () => {
  const registered = ['https://app.example.com/cb', 'http://127.0.0.1:3000/cb'];

  it('matches exactly', () => {
    expect(matchRedirectUri(registered, 'https://app.example.com/cb')).toBe(
      true,
    );
    expect(matchRedirectUri(registered, 'https://app.example.com/cb2')).toBe(
      false,
    );
    expect(
      matchRedirectUri(registered, 'https://app.example.com:8443/cb'),
    ).toBe(false);
  });

  it('lets a loopback URI change only its port', () => {
    expect(matchRedirectUri(registered, 'http://127.0.0.1:51234/cb')).toBe(
      true,
    );
    expect(matchRedirectUri(registered, 'http://127.0.0.1:51234/other')).toBe(
      false,
    );
    expect(matchRedirectUri(registered, 'http://localhost:3000/cb')).toBe(
      false,
    );
  });
});

describe('withParams', () => {
  it('adds the defined parameters, keeping the existing ones', () => {
    expect(
      withParams('https://app.example.com/cb?a=1', {
        code: 'x y',
        state: undefined,
        iss: null,
      }),
    ).toBe('https://app.example.com/cb?a=1&code=x+y');
  });
});
