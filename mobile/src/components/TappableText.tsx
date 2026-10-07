// Text în engleză cu cuvinte tappabile: la tap deschide traducerea/explicația în context.
// Auto-conținut (gestionează singur modalul), ca să fie folosit oriunde apare engleză, nu doar în conversație.
import { useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import WordExplainModal from './WordExplainModal';
import { usePalette } from '../theme';

const WORD_RE = /([A-Za-z]+(?:['’][A-Za-z]+)*)/g;
const IS_WORD = /^[A-Za-z]+(?:['’][A-Za-z]+)*$/;

export function TappableText({
  text,
  sentence,
  style,
  color,
  prefix,
}: {
  text: string;
  /** Propoziția-context trimisă la explicație; implicit chiar `text`. */
  sentence?: string;
  style?: StyleProp<TextStyle>;
  color?: string;
  /** Etichetă simplă (netappabilă) în fața textului, ex. „În propoziție: ". */
  prefix?: string;
}) {
  const p = usePalette();
  const [word, setWord] = useState<string | null>(null);
  const ctx = sentence ?? text;
  // Notă RN: acest component conține un Modal (Sheet) — NU-l pune niciodată în interiorul unui <Text>.
  return (
    <>
      <Text style={[{ color: color ?? p.ink }, style]}>
        {prefix ? <Text>{prefix}</Text> : null}
        {text.split(WORD_RE).map((part, i) =>
          IS_WORD.test(part) ? (
            <Text key={`${part}-${i}`} onPress={() => setWord(part)} suppressHighlighting>
              {part}
            </Text>
          ) : (
            <Text key={`${part}-${i}`}>{part}</Text>
          )
        )}
      </Text>
      {word ? <WordExplainModal word={word} sentence={ctx} onClose={() => setWord(null)} /> : null}
    </>
  );
}
