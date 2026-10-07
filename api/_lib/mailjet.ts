interface MailjetMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  customId: string;
}

export function hasMailjetConfig(): boolean {
  return Boolean(
    process.env.MAILJET_API_KEY?.trim()
    && process.env.MAILJET_SECRET_KEY?.trim()
    && process.env.MAILJET_FROM_EMAIL?.trim()
  );
}

export async function sendMailjetMessage(message: MailjetMessage): Promise<void> {
  const apiKey = process.env.MAILJET_API_KEY?.trim();
  const secretKey = process.env.MAILJET_SECRET_KEY?.trim();
  const fromEmail = process.env.MAILJET_FROM_EMAIL?.trim();
  if (!apiKey || !secretKey || !fromEmail) {
    throw new Error('Mailjet nu este configurat complet în Vercel.');
  }

  const fromName = process.env.MAILJET_FROM_NAME?.trim() || 'EnglezaAI';
  const replyTo = process.env.MAILJET_REPLY_TO?.trim();
  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: fromEmail, Name: fromName },
        To: [{ Email: message.to }],
        ...(replyTo ? { ReplyTo: { Email: replyTo, Name: 'Suport EnglezaAI' } } : {}),
        Subject: message.subject,
        TextPart: message.text,
        HTMLPart: message.html,
        CustomID: message.customId,
      }],
    }),
  });

  const payload = await response.json().catch(() => null) as {
    Messages?: Array<{ Status?: string; Errors?: unknown }>;
    ErrorMessage?: string;
  } | null;
  if (!response.ok || payload?.Messages?.[0]?.Status !== 'success') {
    const detail = payload?.ErrorMessage || JSON.stringify(payload?.Messages?.[0]?.Errors || 'răspuns invalid');
    throw new Error(`Mailjet a refuzat mesajul (${response.status}): ${detail}`);
  }
}
