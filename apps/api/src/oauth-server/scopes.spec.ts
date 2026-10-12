import { formatScopes, knownScopes, parseScopes } from './scopes.js';

describe('parseScopes', () => {
  it.each([undefined, null, '', '   '])(
    'defaults %j to every scope',
    (value) => {
      expect(parseScopes(value)).toEqual(['budget:read', 'budget:write']);
    },
  );

  it('keeps the canonical order and drops repeats', () => {
    expect(parseScopes('budget:write budget:read budget:write')).toEqual([
      'budget:read',
      'budget:write',
    ]);
    expect(parseScopes('budget:read')).toEqual(['budget:read']);
  });

  it.each(['budget:read admin', 'openid', ['budget:read'], 42])(
    'rejects %j',
    (value) => {
      expect(parseScopes(value)).toBeNull();
    },
  );
});

describe('knownScopes / formatScopes', () => {
  it('filters stored values and joins with spaces', () => {
    expect(knownScopes(['budget:write', 'old'])).toEqual(['budget:write']);
    expect(formatScopes(['budget:read', 'budget:write'])).toBe(
      'budget:read budget:write',
    );
  });
});
