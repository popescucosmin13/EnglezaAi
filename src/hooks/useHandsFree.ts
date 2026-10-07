// Modul hands-free (mașină): stare persistentă + wake lock + rutare audio forțată pe TTS
// determinist. Extras din useVoiceChat — acolo devenise greu de urmărit printre celelalte 15+ ref-uri.

import { useEffect, useRef, useState } from 'react';
import { setForceReliableCarTts } from '../audio/tts';

const HANDSFREE_KEY = 'englezaai.handsfree';

/**
 * Ține ecranul aprins cât timp hands-free e activ: în mașină telefonul stă în suport, iar dacă
 * ecranul se stinge, Safari suspendă timerele și închide microfonul — sesiunea moare tăcut.
 * Wake Lock-ul se pierde la minimizare, deci îl recerem la fiecare revenire în prim-plan.
 */
export function useHandsFree() {
  const [handsFree, setHandsFreeState] = useState(() => {
    try { return localStorage.getItem(HANDSFREE_KEY) === '1'; } catch { return false; }
  });
  const handsFreeRef = useRef(handsFree);
  const wakeLock = useRef<any>(null);

  async function acquireWakeLock() {
    const wl = (navigator as any).wakeLock;
    if (!wl || wakeLock.current) return;
    try {
      const sentinel = await wl.request('screen');
      wakeLock.current = sentinel;
      sentinel.addEventListener?.('release', () => {
        if (wakeLock.current === sentinel) wakeLock.current = null;
      });
    } catch { /* nesuportat sau refuzat — modul auto merge, doar cu ecranul stins mai devreme */ }
  }

  function releaseWakeLock() {
    const sentinel = wakeLock.current;
    wakeLock.current = null;
    try { sentinel?.release?.(); } catch { /* deja eliberat */ }
  }

  // Cât timp conversația e deschisă cu hands-free activ, vorbirea merge prin TTS determinist
  // (vocea nativă iOS nu iese pe Bluetooth cu microfonul deschis); la demontare revenim la normal.
  useEffect(() => {
    setForceReliableCarTts(handsFreeRef.current);
    if (handsFreeRef.current) void acquireWakeLock();
    return () => {
      setForceReliableCarTts(false);
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && handsFreeRef.current) void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pornește/oprește modul hands-free (mașină). Persistă între sesiuni. */
  function setHandsFree(on: boolean) {
    handsFreeRef.current = on;
    setHandsFreeState(on);
    setForceReliableCarTts(on);
    try { localStorage.setItem(HANDSFREE_KEY, on ? '1' : '0'); } catch { /* storage indisponibil */ }
    if (on) void acquireWakeLock();
    else releaseWakeLock();
  }

  return { handsFree, handsFreeRef, setHandsFree, acquireWakeLock, releaseWakeLock };
}
