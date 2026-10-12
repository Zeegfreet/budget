import { clientCredentials } from './oauth-server.controller.js';

const basic = (value: string) =>
  `Basic ${Buffer.from(value).toString('base64')}`;

describe('clientCredentials', () => {
  it('reads HTTP Basic, form-decoding both parts', () => {
    expect(clientCredentials({}, basic('my%20id:s%3Acret'))).toEqual({
      clientId: 'my id',
      clientSecret: 's:cret',
    });
  });

  it('falls back to the body', () => {
    expect(
      clientCredentials({ client_id: 'abc', client_secret: 'xyz' }),
    ).toEqual({ clientId: 'abc', clientSecret: 'xyz' });
    expect(clientCredentials({ client_id: ['a', 'b'] })).toEqual({
      clientId: undefined,
      clientSecret: undefined,
    });
  });

  it('ignores a malformed Basic header', () => {
    expect(clientCredentials({}, basic('%E0%A4%A:x'))).toEqual({});
    expect(clientCredentials({ client_id: 'abc' }, basic('no-colon'))).toEqual({
      clientId: 'abc',
      clientSecret: undefined,
    });
  });
});
