import {
  activationEmail,
  groupInvitationEmail,
  preRegistrationEmail,
} from './templates.js';

const url = 'http://web.test/ativar-conta?token=abc&x=1';

describe('mail templates', () => {
  it('activation: greeting, link in both bodies and the expiry', () => {
    const mail = activationEmail({ name: 'Ana', url, ttlHours: 72 });

    expect(mail.subject).toBe('Ative sua conta no Budget');
    expect(mail.text).toContain('Olá, Ana!');
    expect(mail.text).toContain(`Ativar minha conta: ${url}`);
    expect(mail.text).toContain('72 horas');
    expect(mail.text).toContain('pode ignorá-lo');
    expect(mail.html).toContain(
      'href="http://web.test/ativar-conta?token=abc&amp;x=1"',
    );
  });

  it('escapes names in the HTML (not in the text)', () => {
    const mail = activationEmail({
      name: '<b>Ana</b> & "Co"',
      url,
      ttlHours: 1,
    });

    expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt; &amp; &quot;Co&quot;');
    expect(mail.html).not.toContain('<b>Ana</b>');
    expect(mail.text).toContain('<b>Ana</b>');
    expect(mail.text).toContain('1 hora ');
  });

  it('pre-registration: names who added them to which group', () => {
    const mail = preRegistrationEmail({
      nickname: 'Carla',
      url,
      ttlHours: 72,
      group: { inviterName: 'Ana', groupName: 'República' },
    });

    expect(mail.subject).toBe(
      'Ana adicionou você ao grupo "República" no Budget',
    );
    expect(mail.text).toContain('Olá, Carla!');
    expect(mail.text).toContain('criando uma senha');
    expect(mail.html).toContain('&quot;República&quot;');
  });

  it('pre-registration without a group (resend)', () => {
    const mail = preRegistrationEmail({ nickname: 'Carla', url, ttlHours: 72 });

    expect(mail.subject).toBe('Conclua seu cadastro no Budget');
    expect(mail.text).toContain(url);
  });

  it('group invitation: points to the app, no expiry', () => {
    const mail = groupInvitationEmail({
      name: 'Bruno',
      inviterName: 'Ana',
      groupName: 'República',
      url: 'http://web.test/grupos',
    });

    expect(mail.subject).toBe(
      'Ana convidou você para o grupo "República" no Budget',
    );
    expect(mail.text).toContain('Ver convite: http://web.test/grupos');
    expect(mail.text).not.toContain('O link vale');
  });
});
