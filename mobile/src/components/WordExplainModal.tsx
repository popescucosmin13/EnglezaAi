// Explicarea unui cuvânt din conversație — portat de pe web pe Sheet nativ.

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Cefr, Profile } from '../types';
import { chatJson } from '../api/openrouter';
import { speak } from '../audio/tts';
import { getProfile, getCachedWordExplanation, cacheWordExplanation } from '../db/db';
import { addVocabItem } from '../logic/engine';
import { buildWordExplanationPrompt } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import { Icon } from './Icon';
import { Sheet, H3, Tiny, Muted, P, Banner, Button, ButtonRow, Chip, ChipRow, Spinner, IconButton } from '../ui';
import { usePalette } from '../theme';

interface WordExplanation {
  word: string;
  baseForm: string;
  pronunciation: string;
  partOfSpeechRo: string;
  translationRo: string;
  meaningInContextRo: string;
  simpleEnglish: string;
  whyThisFormRo?: string;
  otherMeaningsRo?: string[];
  examples: { en: string; ro: string }[];
  collocations?: string[];
  memoryTipRo?: string;
  cefrLevel?: Cefr;
}

export default function WordExplainModal({ word, sentence, onClose }: { word: string; sentence: string; onClose: () => void }) {
  const p = usePalette();
  const [result, setResult] = useState<WordExplanation | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasOpenRouterKey()) {
        setError('Explicația este temporar indisponibilă. Încearcă din nou puțin mai târziu.');
        return;
      }
      try {
        const prof = await getProfile();
        // potrivire exactă cuvânt+propoziție (ex. exemple din microlecții deja cache-uite, care revin identice)
        const cached = await getCachedWordExplanation(word, sentence).catch(() => undefined);
        const explanation = (cached as WordExplanation | undefined) ?? await chatJson<WordExplanation>([
          { role: 'user', content: buildWordExplanationPrompt(word, sentence, prof) },
        ], { temperature: 0.2, tier: 'utility', feature: 'word_explanation', maxTokens: 1600 });
        if (!cached) await cacheWordExplanation(word, sentence, explanation as unknown as Record<string, unknown>).catch(() => {});
        if (!cancelled) {
          setProfile(prof);
          setResult(explanation);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [word, sentence]);

  async function saveWord() {
    if (!result || !profile) return;
    const expression = result.baseForm || result.word || word;
    await addVocabItem({
      word: expression,
      kind: expression.includes(' ') ? 'expression' : 'word',
      translation: result.translationRo,
      cefrLevel: result.cefrLevel,
      example: result.examples?.[0]?.en ?? sentence,
      personalExample: result.examples?.[1]?.en,
    });
    setSaved(true);
  }

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Tiny>Cuvânt din conversație</Tiny>
          <Text style={{ fontSize: 28, fontWeight: '800', color: p.primaryDeep }}>{result?.baseForm || word}</Text>
        </View>
        <IconButton icon="x" onPress={onClose} />
      </View>

      {!result && !error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 }}>
          <Spinner />
          <Muted>Îți explic sensul din această propoziție…</Muted>
        </View>
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}

      {result && (
        <>
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: p.primarySoft, marginVertical: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: p.ink }}>{result.translationRo}</Text>
            <Tiny>
              {result.partOfSpeechRo} · {result.cefrLevel ?? 'nivel necunoscut'}
            </Tiny>
            <Button
              title={result.pronunciation || 'Ascultă'}
              variant="ghost"
              icon="volume"
              small
              onPress={() => void speak(result.baseForm || result.word, 0.82)}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            />
          </View>

          <H3>Ce înseamnă aici</H3>
          <P>{result.meaningInContextRo}</P>
          <Button
            title="Ascultă explicația în română"
            variant="ghost"
            icon="volume"
            small
            onPress={() => void speak(`${result.translationRo}. ${result.meaningInContextRo}`, 0.9)}
            style={{ alignSelf: 'flex-start' }}
          />
          <Banner kind="info">
            <Text style={{ fontWeight: '700' }}>În engleză simplă: </Text>
            {result.simpleEnglish}
          </Banner>
          {result.whyThisFormRo ? (
            <P>
              <Text style={{ fontWeight: '700' }}>De ce apare așa: </Text>
              {result.whyThisFormRo}
            </P>
          ) : null}

          <H3>Exemple</H3>
          {(result.examples ?? []).map((ex, i) => (
            <View
              key={`${ex.en}-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                paddingVertical: 10,
                borderBottomWidth: i < (result.examples?.length ?? 0) - 1 ? 1 : 0,
                borderBottomColor: p.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: p.ink, fontSize: 15 }}>{ex.en}</Text>
                <Tiny>{ex.ro}</Tiny>
              </View>
              <IconButton icon="volume" color={p.primary} onPress={() => void speak(ex.en, 0.88)} />
            </View>
          ))}

          {(result.collocations?.length ?? 0) > 0 && (
            <>
              <H3>Combinații utile</H3>
              <ChipRow>
                {result.collocations!.map((c) => (
                  <Chip key={c} label={c} />
                ))}
              </ChipRow>
            </>
          )}
          {(result.otherMeaningsRo?.length ?? 0) > 0 && (
            <>
              <Button
                title={showOther ? 'Ascunde alte sensuri' : 'Alte sensuri frecvente'}
                variant="ghost"
                small
                icon={showOther ? 'chevronUp' : 'chevronDown'}
                onPress={() => setShowOther((v) => !v)}
                style={{ alignSelf: 'flex-start' }}
              />
              {showOther &&
                result.otherMeaningsRo!.map((m) => (
                  <Muted key={m} style={{ paddingLeft: 12 }}>
                    • {m}
                  </Muted>
                ))}
            </>
          )}
          {result.memoryTipRo ? (
            <View style={{ padding: 12, borderRadius: 14, backgroundColor: p.tipBg, marginVertical: 8 }}>
              <Text style={{ color: p.ink, fontSize: 14.5 }}>
                <Text style={{ fontWeight: '700' }}>Ține minte: </Text>
                {result.memoryTipRo}
              </Text>
            </View>
          ) : null}

          <ButtonRow>
            <Button
              title={saved ? 'Salvat în vocabular' : 'Salvează în vocabular'}
              variant="primary"
              icon={saved ? 'check' : 'star'}
              onPress={saveWord}
              disabled={saved}
            />
            <Button title="Am înțeles" onPress={onClose} />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}
