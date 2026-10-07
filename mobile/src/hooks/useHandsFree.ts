// Modul hands-free (mașină) pe nativ: stare persistentă + keep-awake (expo) + forțare Google TTS
// pentru engleză. Perechea de platformă a src/hooks/useHandsFree.ts de pe web.

import { useEffect, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { setForceGoogleEnglish } from '../audio/tts';
import { storage } from '../storage';

const HANDSFREE_KEY = 'englezaai.handsfree';
const KEEP_AWAKE_TAG = 'englezaai-handsfree';

export function useHandsFree() {
  const [handsFree, setHandsFreeState] = useState(() => storage.getItem(HANDSFREE_KEY) === '1');
  const handsFreeRef = useRef(handsFree);

  // Cât timp conversația e deschisă cu hands-free activ, engleza merge prin Google TTS
  // (preferință păstrată de pe web); la demontare revenim la normal.
  useEffect(() => {
    setForceGoogleEnglish(handsFreeRef.current);
    // în mașină telefonul stă în suport: ecranul stins ar opri bucla hands-free
    if (handsFreeRef.current) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      setForceGoogleEnglish(false);
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Eliberează keep-awake-ul fără să oprească modul hands-free (la finalul sesiunii). */
  function releaseHandsFreeScreen() {
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }

  /** Pornește/oprește modul hands-free (mașină). Persistă între sesiuni. */
  function setHandsFree(on: boolean) {
    handsFreeRef.current = on;
    setHandsFreeState(on);
    setForceGoogleEnglish(on); // în mașină, engleza trece pe Google TTS (voce consistentă pe Bluetooth)
    storage.setItem(HANDSFREE_KEY, on ? '1' : '0');
    if (on) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(KEEP_AWAKE_TAG);
  }

  return { handsFree, handsFreeRef, setHandsFree, releaseHandsFreeScreen };
}
