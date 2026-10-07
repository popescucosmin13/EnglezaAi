import type { VercelRequest, VercelResponse } from '@vercel/node';
import { postOnly, safeError } from './_lib/auth.js';
import { requireAiAccess } from './_lib/access.js';
import { allowRequestAsync } from './_lib/rate-limit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!postOnly(req, res)) return;
  const access = await requireAiAccess(req, res, 'azure');
  if (!access || !(await allowRequestAsync(res, access.uid, 'azure', 30))) return;
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';
  if (!key) return res.status(503).json({ error: 'AZURE_SPEECH_KEY nu este configurat în Vercel.' });

  try {
    if (req.body?.test === true) {
      const test = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key },
      });
      if (!test.ok) return res.status(502).json({ error: `Azure Speech a respins cheia (${test.status}).` });
      return res.status(200).json({ ok: true });
    }

    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64 : '';
    const referenceText = typeof req.body?.referenceText === 'string' ? req.body.referenceText.trim() : '';
    if (!audioBase64 || !referenceText || referenceText.length > 1000) return res.status(400).json({ error: 'Audio sau text de referință invalid.' });
    if (audioBase64.length > 7_000_000) return res.status(413).json({ error: 'Înregistrarea audio este prea mare.' });

    const paConfig = Buffer.from(JSON.stringify({
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      // ATENȚIE: Azure cere string "True", nu boolean. Cu `true`, header-ul Pronunciation-Assessment
      // nu se parsează, iar serviciul îl ignoră tăcut → răspunde Success DAR fără niciun scor PA.
      EnableProsodyAssessment: 'True',
    })).toString('base64');
    // Modul de recunoaștere OBLIGATORIU în path: pentru Pronunciation Assessment, Microsoft
    // documentează exclusiv `conversation` (întoarce PA complet, inclusiv pe fraze scurte).
    // `interactive` face recunoaștere dar NU întoarce scoruri PA; lipsa segmentului dă 404 → 502.
    const upstream = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Pronunciation-Assessment': paConfig,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        Accept: 'application/json',
      },
      body: Buffer.from(audioBase64, 'base64'),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error('Azure upstream error', upstream.status, data);
      return res.status(502).json({ error: `Azure Speech a răspuns cu eroarea ${upstream.status}.` });
    }
    // Azure poate răspunde 200 dar cu RecognitionStatus eșuat (NoMatch / InitialSilenceTimeout)
    // sau cu PA lipsă — clientul trebuie să știe că NU e un scor real de 0, ci o eșuare a recunoașterii.
    const status = data?.RecognitionStatus;
    // API-ul REST short-audio pune scorurile PLAT pe NBest[0] (AccuracyScore, PronScore...), nu
    // într-un sub-obiect `PronunciationAssessment` (aia e forma SDK/WebSocket). Acceptăm ambele.
    const best0 = data?.NBest?.[0];
    const hasPa = best0 != null && (
      best0.PronunciationAssessment != null ||
      typeof best0.AccuracyScore === 'number' ||
      typeof best0.PronScore === 'number'
    );
    if (status && status !== 'Success') {
      console.warn('Azure RecognitionStatus', status, JSON.stringify({ n: data?.NBest?.length ?? 0 }));
      return res.status(422).json({ error: `Azure nu a putut evalua înregistrarea (${status}).` });
    }
    if (!hasPa) {
      console.warn('Azure fără PronunciationAssessment', JSON.stringify({ status, nbestKeys: best0 ? Object.keys(best0) : [] }));
      return res.status(422).json({ error: 'Azure nu a returnat scoruri de pronunție pentru înregistrare.' });
    }
    return res.status(200).json(data);
  } catch (error) {
    return safeError(res, 'Azure Speech', error);
  }
}
