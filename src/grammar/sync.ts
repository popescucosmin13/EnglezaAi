// Sincronizarea progresului la cursul de gramatică cu Firestore (users/{uid}/meta/grammarCourse).
//
// Local rămâne oglinda rapidă (UI-ul citește sincron), cloudul e sursa de adevăr între dispozitive.
// La deschiderea cursului aducem starea din cloud și o îmbinăm cu cea locală; scrierile pleacă în
// fundal, grupate, ca un set de 12 exerciții să însemne o singură scriere, nu douăsprezece.

import { getMetaDoc, saveMetaDoc } from '../db/db';
import {
  getGrammarProgress,
  getDrillMemory,
  writeGrammarState,
  mergeProgress,
  mergeDrill,
  onGrammarChange,
  type GrammarState,
} from './progress';

const REMOTE_DOC = 'grammarCourse';
const PUSH_DELAY_MS = 1500;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

function localState(): GrammarState {
  return { progress: getGrammarProgress(), drill: getDrillMemory() };
}

async function pushNow(): Promise<void> {
  const { progress, drill } = localState();
  try {
    await saveMetaDoc(REMOTE_DOC, { progress, drill });
  } catch {
    // offline sau fără sesiune: local rămâne corect, iar următoarea scriere urcă tot.
    // Firestore are persistență offline, deci de obicei scrierea se reia singură la reconectare.
  }
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, PUSH_DELAY_MS);
}

/**
 * Aduce starea din Firestore, o îmbină cu cea locală, o scrie în ambele părți și se abonează la
 * scrierile ulterioare. Se apelează la deschiderea cursului; fără rețea rămâne starea locală.
 */
export async function syncGrammarState(): Promise<GrammarState> {
  if (!subscribed) {
    onGrammarChange(schedulePush);
    subscribed = true;
  }

  const local = localState();
  let remote: Partial<GrammarState> | undefined;
  try {
    remote = await getMetaDoc<Partial<GrammarState>>(REMOTE_DOC);
  } catch {
    return local;
  }

  if (!remote) {
    // primul dispozitiv care sincronizează — urcăm ce avem, dacă avem ceva
    if (Object.keys(local.progress).length > 0 || Object.keys(local.drill).length > 0) schedulePush();
    return local;
  }

  const remoteState: GrammarState = { progress: remote.progress ?? {}, drill: remote.drill ?? {} };
  const merged: GrammarState = {
    progress: mergeProgress(local.progress, remoteState.progress),
    drill: mergeDrill(local.drill, remoteState.drill),
  };
  writeGrammarState(merged);

  // urcăm înapoi doar dacă îmbinarea a adăugat ceva față de ce era deja în cloud
  if (JSON.stringify(merged) !== JSON.stringify(remoteState)) schedulePush();

  return merged;
}
