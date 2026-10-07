// Ajutor la cerere pe o replică (explică / tradu) — portat de pe web pe Sheet nativ.

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Profile } from '../types';
import { chatJson } from '../api/openrouter';
import { cacheMessageExplanation, getCachedMessageExplanation, getProfile } from '../db/db';
import { speak } from '../audio/tts';
import { buildMessageHelpPrompt } from '../prompts';
import { Sheet, H3, Tiny, Muted, P, Banner, Button, ButtonRow, Spinner, IconButton } from '../ui';
import { usePalette } from '../theme';

export type MessageHelpMode = 'explain' | 'translate';

interface MessageHelpResult {
  translationRo: string;
  meaningRo: string;
  corrected?: string;
  natural?: string;
  mistakes: { wrong: string; correct: string; explanationRo: string }[];
  usefulExpressions: { expression: string; meaningRo: string }[];
}

export default function MessageHelpModal({
  mode,
  role,
  text,
  nextTeacherText,
  context,
  onClose,
}: {
  mode: MessageHelpMode;
  role: 'user' | 'ai';
  text: string;
  nextTeacherText?: string;
  context: string;
  onClose: () => void;
}) {
  const p = usePalette();
  const [result, setResult] = useState<MessageHelpResult | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prof = await getProfile();
        const cacheParts = [mode, role, text, nextTeacherText ?? '', context, prof.currentLevel, prof.mainObjective];
        const cached = await getCachedMessageExplanation(cacheParts).catch(() => undefined);
        const response = (cached as unknown as MessageHelpResult | undefined) ?? await chatJson<MessageHelpResult>([
          { role: 'user', content: buildMessageHelpPrompt({ mode, role, text, nextTeacherText, context, profile: prof }) },
        ], { temperature: 0.15, tier: 'utility', feature: 'message_help', maxTokens: 1400 });
        if (!cached) await cacheMessageExplanation(cacheParts, response as unknown as Record<string, unknown>).catch(() => {});
        if (!cancelled) {
          setProfile(prof);
          setResult({ ...response, mistakes: response.mistakes ?? [], usefulExpressions: response.usefulExpressions ?? [] });
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, role, text, nextTeacherText, context]);

  const title = mode === 'translate' ? 'Traducere în română' : role === 'user' ? 'Ce ai greșit?' : 'Explicația profesorului';

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Tiny>Ajutor la cerere · nivel {profile?.currentLevel ?? '…'}</Tiny>
          <Text style={{ fontSize: 22, fontWeight: '800', color: p.primaryDeep }}>{title}</Text>
        </View>
        <IconButton icon="x" onPress={onClose} />
      </View>

      <View
        style={{
          marginVertical: 12,
          paddingVertical: 11,
          paddingHorizontal: 13,
          borderLeftWidth: 3,
          borderLeftColor: p.primary,
          backgroundColor: p.bgSoft,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
        }}
      >
        <Muted>„{text}”</Muted>
      </View>
      {!result && !error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
          <Spinner />
          <Muted>Pregătesc explicația clară în română…</Muted>
        </View>
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}

      {result && (
        <>
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: p.primarySoft, marginVertical: 6 }}>
            <Tiny>În română</Tiny>
            <Text style={{ fontSize: 17, fontWeight: '700', color: p.ink, marginVertical: 3 }}>{result.translationRo}</Text>
            <Button
              title="Ascultă traducerea"
              variant="ghost"
              icon="volume"
              small
              onPress={() => void speak(result.translationRo, 0.9)}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>

          {result.meaningRo ? <P>{result.meaningRo}</P> : null}

          {result.mistakes.length > 0 && (
            <>
              <H3>Ce trebuie corectat</H3>
              {result.mistakes.map((mistake, index) => (
                <View
                  key={`${mistake.wrong}-${index}`}
                  style={{ paddingVertical: 11, paddingHorizontal: 12, marginVertical: 7, borderRadius: 13, backgroundColor: p.dangerSoft }}
                >
                  <Text style={{ color: p.ink, fontSize: 15 }}>
                    <Text style={{ color: p.danger, textDecorationLine: 'line-through' }}>{mistake.wrong}</Text> →{' '}
                    <Text style={{ fontWeight: '700' }}>{mistake.correct}</Text>
                  </Text>
                  <Text style={{ color: p.ink, fontSize: 13.5, marginTop: 5 }}>{mistake.explanationRo}</Text>
                </View>
              ))}
            </>
          )}

          {mode === 'explain' && role === 'user' && result.mistakes.length === 0 && (
            <Banner kind="info">✓ Propoziția este acceptabilă în acest context. Nu am găsit o greșeală reală.</Banner>
          )}

          {result.corrected && result.corrected !== text && (
            <MirrorLine label="Corect" text={result.corrected} bg={p.successSoft} />
          )}
          {result.natural && result.natural !== result.corrected && (
            <MirrorLine label="Mai natural" text={result.natural} bg={p.primarySoft} />
          )}

          {result.usefulExpressions.length > 0 && (
            <>
              <H3>Expresii utile</H3>
              {result.usefulExpressions.map((item, i) => (
                <View
                  key={item.expression}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: i < result.usefulExpressions.length - 1 ? 1 : 0,
                    borderBottomColor: p.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: p.ink, fontSize: 15 }}>{item.expression}</Text>
                    <Tiny>{item.meaningRo}</Tiny>
                  </View>
                  <IconButton icon="volume" color={p.primary} onPress={() => void speak(item.expression, 0.88)} />
                </View>
              ))}
            </>
          )}

          <ButtonRow>
            <Button title="Am înțeles" variant="primary" onPress={onClose} />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}

function MirrorLine({ label, text, bg }: { label: string; text: string; bg: string }) {
  const p = usePalette();
  return (
    <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 7, backgroundColor: bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
          {label}
        </Text>
        <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(text, 0.9)} />
      </View>
      <Text style={{ color: p.ink, fontSize: 15.5 }}>{text}</Text>
    </View>
  );
}
