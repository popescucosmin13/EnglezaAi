import type { VercelRequest, VercelResponse } from '@vercel/node';
import { postOnly, safeError } from './_lib/auth.js';
import { requireAiAccess } from './_lib/access.js';
import { allowRequestAsync } from './_lib/rate-limit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!postOnly(req, res)) return;
  const access = await requireAiAccess(req, res, 'tts');
  if (!access || !(await allowRequestAsync(res, access.uid, 'tts', 30))) return;
  const { provider, text, model, voice, rate, romanian } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) return res.status(400).json({ error: 'Text TTS invalid sau prea lung.' });

  try {
    if (provider === 'google-ai') return await googleTts(req, res);
    if (provider === 'azure') return await azureTts(req, res);
    if (provider === 'openai-compatible') return await compatibleTts(req, res);
    return res.status(400).json({ error: 'Provider TTS necunoscut.' });
  } catch (error) {
    return safeError(res, 'Text-to-Speech', error);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** TTS neural determinist, pe aceleași credențiale Azure Speech folosite la Pronunciation Assessment. */
async function azureTts(req: VercelRequest, res: VercelResponse) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';
  if (!key) return res.status(503).json({ error: 'AZURE_SPEECH_KEY nu este configurat în Vercel.' });
  const { text, voice, rate, romanian } = req.body;
  const lang = romanian ? 'ro-RO' : 'en-US';
  const selectedVoice = typeof voice === 'string' && voice ? voice : (romanian ? 'ro-RO-AlinaNeural' : 'en-US-AriaNeural');
  const ratePct = Math.round((Number(rate) || 1) * 100 - 100);
  const rateAttr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;
  const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${selectedVoice}"><prosody rate="${rateAttr}">${escapeXml(String(text))}</prosody></voice></speak>`;
  const upstream = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'EnglezaAI',
    },
    body: ssml,
  });
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    console.error('Azure TTS upstream error', upstream.status, errText);
    return res.status(502).json({ error: `Azure TTS a răspuns cu eroarea ${upstream.status}.` });
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  return res.status(200).json({ audioBase64: bytes.toString('base64'), format: 'audio/mpeg' });
}

async function googleTts(req: VercelRequest, res: VercelResponse) {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) return res.status(503).json({ error: 'GOOGLE_AI_API_KEY nu este configurat în Vercel.' });
  const { text, model, voice, rate, romanian } = req.body;
  const selectedModel = typeof model === 'string' && model ? model : 'gemini-2.5-flash-preview-tts';
  const selectedVoice = typeof voice === 'string' && voice ? voice : 'Kore';
  const languageInstruction = romanian
    ? 'Speak in natural Romanian from Romania, warmly and clearly, like a patient personal teacher.'
    : 'Speak in clear natural American English, warmly, like a patient language teacher.';
  const pace = Number(rate) < 0.95 ? 'Use a slightly slow learning pace with natural pauses.' : 'Use a natural conversational pace.';
  const prompt = `${languageInstruction} ${pace}\nRead ONLY the following text, without adding or changing anything:\n${text}`;
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
      },
    }),
  });
  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    console.error('Google TTS upstream error', upstream.status, data);
    return res.status(502).json({ error: `Google AI TTS a răspuns cu eroarea ${upstream.status}.` });
  }
  const pcmBase64 = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)?.inlineData?.data;
  if (!pcmBase64) return res.status(502).json({ error: 'Google AI TTS nu a returnat audio.' });
  const googleUsage = data?.usageMetadata;
  const usage = googleUsage ? {
    prompt_tokens: googleUsage.promptTokenCount ?? 0,
    completion_tokens: googleUsage.candidatesTokenCount ?? 0,
    total_tokens: googleUsage.totalTokenCount ?? 0,
  } : undefined;
  return res.status(200).json({
    audioBase64: pcmBase64,
    format: 'pcm16',
    sampleRate: 24000,
    meta: { requestedModel: selectedModel, actualModel: selectedModel, usage },
  });
}

async function compatibleTts(req: VercelRequest, res: VercelResponse) {
  const key = process.env.TTS_API_KEY;
  const baseUrl = (process.env.TTS_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  if (!key) return res.status(503).json({ error: 'TTS_API_KEY nu este configurat în Vercel.' });
  const { text, model, voice, rate } = req.body;
  const upstream = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input: text, speed: rate }),
  });
  if (!upstream.ok) return res.status(502).json({ error: `Serviciul TTS a răspuns cu eroarea ${upstream.status}.` });
  const bytes = Buffer.from(await upstream.arrayBuffer());
  return res.status(200).json({ audioBase64: bytes.toString('base64'), format: 'audio/mpeg' });
}
