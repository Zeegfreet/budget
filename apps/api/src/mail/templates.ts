/** Subject and bodies of a message, before the recipient is set. */
export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const IGNORE_NOTE = 'Se você não esperava este e-mail, pode ignorá-lo.';

interface Layout {
  subject: string;
  greeting: string;
  /** Plain-text paragraphs (escaped for the HTML version) */
  paragraphs: string[];
  action: { label: string; url: string };
  /** Shown under the button, e.g. how long the link lasts */
  note?: string;
}

/** One layout for every message: greeting, paragraphs, a button and the link in full. */
function render({
  subject,
  greeting,
  paragraphs,
  action,
  note,
}: Layout): MailContent {
  const footer = [note, IGNORE_NOTE].filter(Boolean) as string[];
  const text = [
    greeting,
    ...paragraphs,
    `${action.label}: ${action.url}`,
    ...footer,
    '— Budget',
  ].join('\n\n');

  const p = (content: string) =>
    `<p style="margin:0 0 16px;line-height:1.5">${content}</p>`;
  const url = escapeHtml(action.url);
  const html = [
    '<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">',
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">',
    p(`<strong>${escapeHtml(greeting)}</strong>`),
    ...paragraphs.map((paragraph) => p(escapeHtml(paragraph))),
    `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(action.label)}</a></p>`,
    p(
      `<span style="font-size:13px;color:#71717a">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${url}" style="color:#71717a;word-break:break-all">${url}</a></span>`,
    ),
    ...footer.map((line) =>
      p(
        `<span style="font-size:13px;color:#71717a">${escapeHtml(line)}</span>`,
      ),
    ),
    '</div></body></html>',
  ].join('');

  return { subject, text, html };
}

const validFor = (hours: number) =>
  `O link vale por ${hours} ${hours === 1 ? 'hora' : 'horas'} e só pode ser usado uma vez.`;

const validForMinutes = (minutes: number) =>
  `O link vale por ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e só pode ser usado uma vez.`;

/** After a sign-up with e-mail and password: proves the e-mail before the first sign-in. */
export function activationEmail({
  name,
  url,
  ttlHours,
}: {
  name: string;
  url: string;
  ttlHours: number;
}): MailContent {
  return render({
    subject: 'Ative sua conta no Budget',
    greeting: `Olá, ${name}!`,
    paragraphs: [
      'Recebemos o cadastro deste e-mail no Budget. Para começar a usar sua conta, confirme que o e-mail é seu.',
    ],
    action: { label: 'Ativar minha conta', url },
    note: validFor(ttlHours),
  });
}

/**
 * For an e-mail without an account added to a group (a pre-registration):
 * the link finishes the sign-up. Without `group` (a resend) it only invites
 * them to finish it.
 */
export function preRegistrationEmail({
  nickname,
  url,
  ttlHours,
  group,
}: {
  nickname: string;
  url: string;
  ttlHours: number;
  group?: { inviterName: string; groupName: string };
}): MailContent {
  return render({
    subject: group
      ? `${group.inviterName} adicionou você ao grupo "${group.groupName}" no Budget`
      : 'Conclua seu cadastro no Budget',
    greeting: `Olá, ${nickname}!`,
    paragraphs: group
      ? [
          `${group.inviterName} adicionou você ao grupo "${group.groupName}" no Budget, onde vocês dividem receitas e despesas em comum.`,
          'Para ver o grupo, ative sua conta criando uma senha e completando seu cadastro.',
        ]
      : [
          'Você foi adicionado a um grupo no Budget. Para acessá-lo, ative sua conta criando uma senha e completando seu cadastro.',
        ],
    action: { label: 'Ativar minha conta', url },
    note: validFor(ttlHours),
  });
}

/** For a registered user invited to a group: they accept or decline in the app. */
export function groupInvitationEmail({
  name,
  inviterName,
  groupName,
  url,
}: {
  name: string;
  inviterName: string;
  groupName: string;
  url: string;
}): MailContent {
  return render({
    subject: `${inviterName} convidou você para o grupo "${groupName}" no Budget`,
    greeting: `Olá, ${name}!`,
    paragraphs: [
      `${inviterName} convidou você para participar do grupo "${groupName}" no Budget.`,
      'Entre no Budget para aceitar ou recusar o convite.',
    ],
    action: { label: 'Ver convite', url },
  });
}

/** "Esqueci minha senha": the link sets a new password. */
export function passwordResetEmail({
  name,
  url,
  ttlMinutes,
}: {
  name: string;
  url: string;
  ttlMinutes: number;
}): MailContent {
  return render({
    subject: 'Redefina sua senha no Budget',
    greeting: `Olá, ${name}!`,
    paragraphs: [
      'Recebemos um pedido para redefinir a senha da sua conta no Budget. Para criar uma nova senha, use o botão abaixo.',
      'Se você não pediu, ignore este e-mail: sua senha continua a mesma.',
    ],
    action: { label: 'Redefinir senha', url },
    note: validForMinutes(ttlMinutes),
  });
}

/** After a reset through the e-mailed link, so a stranger's reset doesn't go unnoticed. */
export function passwordChangedEmail({
  name,
  url,
}: {
  name: string;
  url: string;
}): MailContent {
  return render({
    subject: 'Sua senha do Budget foi alterada',
    greeting: `Olá, ${name}!`,
    paragraphs: [
      'A senha da sua conta no Budget acabou de ser redefinida, e os aparelhos conectados foram desconectados.',
      'Se não foi você, peça um novo link de redefinição na tela de login para recuperar o acesso.',
    ],
    action: { label: 'Entrar no Budget', url },
  });
}
