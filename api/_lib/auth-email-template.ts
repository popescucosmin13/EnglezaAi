export type AuthEmailKind = 'verify-email' | 'password-reset';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]!);
}

export function brandedActionUrl(firebaseLink: string, appUrl: string): string {
  const source = new URL(firebaseLink);
  const target = new URL('/auth-action', appUrl.endsWith('/') ? appUrl : `${appUrl}/`);
  for (const key of ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang', 'tenantId']) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  if (!target.searchParams.get('oobCode') || !target.searchParams.get('mode')) {
    throw new Error('Firebase a generat un link de acțiune incomplet.');
  }
  target.searchParams.set('lang', 'ro');
  return target.toString();
}

export function authEmailTemplate(kind: AuthEmailKind, actionUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const safeUrl = escapeHtml(actionUrl);
  const verify = kind === 'verify-email';
  const subject = verify
    ? 'Confirmă adresa ta de email — EnglezaAI'
    : 'Alege o parolă nouă — EnglezaAI';
  const title = verify ? 'Mai e doar un pas.' : 'Hai să-ți recuperăm accesul.';
  const intro = verify
    ? 'Confirmă adresa de email ca să-ți păstrăm progresul în siguranță și sincronizat pe toate dispozitivele.'
    : 'Am primit o solicitare de resetare a parolei pentru contul tău EnglezaAI.';
  const button = verify ? 'Confirmă adresa de email' : 'Alege parola nouă';
  const expiry = verify
    ? 'Dacă nu ai creat tu acest cont, poți ignora mesajul.'
    : 'Dacă nu ai cerut resetarea, ignoră mesajul. Parola actuală rămâne neschimbată.';
  const text = `${title}\n\n${intro}\n\n${button}: ${actionUrl}\n\n${expiry}\n\nEchipa EnglezaAI`;

  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f3f1ff;font-family:Arial,Helvetica,sans-serif;color:#17172c">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(intro)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ff;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 16px 50px rgba(62,47,151,.12)">
        <tr><td style="padding:34px 38px 20px;background:linear-gradient(135deg,#4f46d8,#8857f5);color:#fff">
          <div style="font-size:20px;font-weight:800;letter-spacing:-.3px">✦ EnglezaAI</div>
          <div style="margin-top:22px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.8">Învață. Vorbește. Progresează.</div>
        </td></tr>
        <tr><td style="padding:36px 38px 18px">
          <h1 style="margin:0 0 16px;font-size:32px;line-height:1.12;letter-spacing:-1px">${escapeHtml(title)}</h1>
          <p style="margin:0;color:#5e6075;font-size:16px;line-height:1.65">${escapeHtml(intro)}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px 0 24px"><tr><td style="border-radius:14px;background:#6353e8">
            <a href="${safeUrl}" style="display:inline-block;padding:16px 24px;color:#fff;text-decoration:none;font-size:16px;font-weight:700">${escapeHtml(button)} →</a>
          </td></tr></table>
          <p style="margin:0;color:#898a9d;font-size:13px;line-height:1.55">${escapeHtml(expiry)}</p>
        </td></tr>
        <tr><td style="padding:20px 38px 34px;border-top:1px solid #eceaf8;color:#9a9bad;font-size:12px;line-height:1.6">
          Butonul nu funcționează? Copiază acest link în browser:<br>
          <a href="${safeUrl}" style="color:#6353e8;word-break:break-all">${safeUrl}</a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#85869b;font-size:12px">© EnglezaAI · Profesorul tău personal de engleză</p>
    </td></tr>
  </table>
</body></html>`,
  };
}
