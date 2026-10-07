// Uid-ul utilizatorului curent, setat de AuthProvider la login/logout.
// Stratul de date (db.ts) citește uid-ul de aici ca să scopeze datele Firestore per utilizator.

let currentUid: string | null = null;

export function setCurrentUid(uid: string | null): void {
  currentUid = uid;
}

export function getCurrentUid(): string {
  if (!currentUid) throw new Error('Niciun utilizator autentificat.');
  return currentUid;
}

export function hasCurrentUid(): boolean {
  return currentUid !== null;
}
