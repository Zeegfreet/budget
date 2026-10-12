import { isCodeChallenge, isCodeVerifier, s256, verifyPkce } from './pkce.js';

// RFC 7636 appendix B
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE', () => {
  it('computes the S256 challenge of the RFC example', () => {
    expect(s256(VERIFIER)).toBe(CHALLENGE);
    expect(isCodeChallenge(CHALLENGE)).toBe(true);
  });

  it('verifies the matching verifier only', () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce(`${VERIFIER.slice(0, -1)}a`, CHALLENGE)).toBe(false);
    expect(verifyPkce(undefined, CHALLENGE)).toBe(false);
  });

  it.each(['short', 'a'.repeat(129), 'a'.repeat(43) + ' ', 42])(
    'rejects the verifier %j',
    (value) => {
      expect(isCodeVerifier(value)).toBe(false);
    },
  );
});
