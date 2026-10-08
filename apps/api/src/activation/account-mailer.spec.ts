import type { MailService } from '../mail/mail.service.js';
import { AccountMailer } from './account-mailer.js';
import type { ActivationService } from './activation.service.js';

const ana = { id: 1, email: 'ana@example.com', name: 'Ana' };

describe('AccountMailer', () => {
  const activation = {
    ttlHours: 72,
    issue: vi.fn(),
    linkFor: (token: string) => `http://web.test/ativar-conta?token=${token}`,
    webUrlFor: (path: string) => `http://web.test${path}`,
    findUnactivated: vi.fn(),
  };
  const mail = { send: vi.fn() };
  const mailer = new AccountMailer(
    activation as unknown as ActivationService,
    mail as unknown as MailService,
  );
  const sent = () =>
    mail.send.mock.calls.at(-1)?.[0] as {
      to: string;
      subject: string;
      text: string;
    };

  beforeEach(() => {
    vi.clearAllMocks();
    activation.issue.mockResolvedValue('tok');
    mail.send.mockResolvedValue(true);
  });

  it('sends the activation link to a new account', async () => {
    await expect(mailer.sendActivation(ana)).resolves.toBe(true);

    expect(activation.issue).toHaveBeenCalledWith(1);
    expect(sent()).toMatchObject({
      to: 'ana@example.com',
      subject: 'Ative sua conta no Budget',
    });
    expect(sent().text).toContain('http://web.test/ativar-conta?token=tok');
  });

  it('sends the pre-registration link naming the group', async () => {
    await mailer.sendPreRegistration(ana, {
      inviterName: 'Bruno',
      groupName: 'Casa',
    });

    expect(sent().subject).toBe(
      'Bruno adicionou você ao grupo "Casa" no Budget',
    );
    expect(sent().text).toContain('token=tok');
  });

  it('sends a group invitation without a token', async () => {
    await mailer.sendGroupInvitation(ana, {
      inviterName: 'Bruno',
      groupName: 'Casa',
    });

    expect(activation.issue).not.toHaveBeenCalled();
    expect(sent().text).toContain('http://web.test/grupos');
  });

  it('resends by the kind of account, and nothing for others', async () => {
    activation.findUnactivated.mockResolvedValueOnce({
      ...ana,
      pending: false,
    });
    await mailer.resend('ana@example.com');
    expect(sent().subject).toBe('Ative sua conta no Budget');

    activation.findUnactivated.mockResolvedValueOnce({ ...ana, pending: true });
    await mailer.resend('ana@example.com');
    expect(sent().subject).toBe('Conclua seu cadastro no Budget');

    mail.send.mockClear();
    activation.findUnactivated.mockResolvedValueOnce(null);
    await mailer.resend('x@example.com');
    expect(mail.send).not.toHaveBeenCalled();
  });
});
