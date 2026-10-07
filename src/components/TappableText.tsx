// Text în engleză cu cuvinte tappabile: la tap deschide traducerea/explicația în context.
// Auto-conținut (gestionează singur modalul), ca să fie folosit oriunde apare engleză, nu doar în conversație.
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import WordExplainModal from './WordExplainModal';

const WORD_RE = /([A-Za-z]+(?:['’][A-Za-z]+)*)/g;
const IS_WORD = /^[A-Za-z]+(?:['’][A-Za-z]+)*$/;

export function TappableText({
  text,
  sentence,
  className,
  style,
}: {
  text: string;
  /** Propoziția-context trimisă la explicație; implicit chiar `text`. */
  sentence?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [word, setWord] = useState<string | null>(null);
  const ctx = sentence ?? text;
  return (
    <>
      <span className={className} style={style}>
        {text.split(WORD_RE).map((part, i) =>
          IS_WORD.test(part) ? (
            <button
              type="button"
              className="clickable-word"
              key={`${part}-${i}`}
              onClick={(e) => { e.stopPropagation(); setWord(part); }}
              title={`Explică „${part}”`}
            >
              {part}
            </button>
          ) : (
            <span key={`${part}-${i}`}>{part}</span>
          )
        )}
      </span>
      {word && createPortal(<WordExplainModal word={word} sentence={ctx} onClose={() => setWord(null)} />, document.body)}
    </>
  );
}
