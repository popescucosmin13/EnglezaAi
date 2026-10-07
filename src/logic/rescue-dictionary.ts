// Dicționar-seed pentru RESCUE: cuvintele de zi cu zi pe care vorbitorii de română le blochează
// cel mai des în engleză. Lookup instant, ZERO tokeni, sub 5ms — plasa care prinde majoritatea
// cazurilor înainte să fie nevoie de vreun apel AI. Cache-ul din Firestore + LLM-ul pe tier ieftin
// acoperă doar ce nu e aici (vezi api/rescue.ts).

export interface RescueEntry {
  en: string;
  alternatives?: string[];
}

// Cheile sunt normalizate (litere mici, fără diacritice) — vezi normalizeRo.
const RAW: Record<string, RescueEntry> = {
  aspirator: { en: 'vacuum cleaner', alternatives: ['hoover'] },
  frigider: { en: 'fridge', alternatives: ['refrigerator'] },
  congelator: { en: 'freezer' },
  cuptor: { en: 'oven' },
  'masina de spalat': { en: 'washing machine' },
  'masina de spalat vase': { en: 'dishwasher' },
  prajitor: { en: 'toaster' },
  fierbator: { en: 'kettle' },
  priza: { en: 'socket', alternatives: ['power outlet'] },
  stecher: { en: 'plug' },
  intrerupator: { en: 'light switch' },
  bec: { en: 'light bulb' },
  incarcator: { en: 'charger' },
  prelungitor: { en: 'extension cord' },
  robinet: { en: 'tap', alternatives: ['faucet'] },
  chiuveta: { en: 'sink' },
  dus: { en: 'shower' },
  prosop: { en: 'towel' },
  perna: { en: 'pillow' },
  patura: { en: 'blanket' },
  cearsaf: { en: 'bed sheet' },
  sertar: { en: 'drawer' },
  raft: { en: 'shelf' },
  dulap: { en: 'wardrobe', alternatives: ['cupboard'] },
  canapea: { en: 'sofa', alternatives: ['couch'] },
  scaun: { en: 'chair' },
  cana: { en: 'mug', alternatives: ['cup'] },
  farfurie: { en: 'plate' },
  furculita: { en: 'fork' },
  lingura: { en: 'spoon' },
  cutit: { en: 'knife' },
  tigaie: { en: 'frying pan' },
  oala: { en: 'pot' },
  factura: { en: 'bill', alternatives: ['invoice'] },
  chitanta: { en: 'receipt' },
  chirie: { en: 'rent' },
  imprumut: { en: 'loan' },
  economii: { en: 'savings' },
  taxa: { en: 'fee', alternatives: ['tax'] },
  concediu: { en: 'holiday', alternatives: ['vacation', 'time off'] },
  'concediu medical': { en: 'sick leave' },
  sedinta: { en: 'meeting' },
  termen: { en: 'deadline' },
  angajat: { en: 'employee' },
  angajator: { en: 'employer' },
  sef: { en: 'boss', alternatives: ['manager'] },
  coleg: { en: 'colleague', alternatives: ['coworker'] },
  interviu: { en: 'interview' },
  salariu: { en: 'salary', alternatives: ['wage'] },
  raceala: { en: 'cold' },
  gripa: { en: 'flu' },
  febra: { en: 'fever', alternatives: ['temperature'] },
  tuse: { en: 'cough' },
  durere: { en: 'pain', alternatives: ['ache'] },
  'durere de cap': { en: 'headache' },
  reteta: { en: 'prescription', alternatives: ['recipe'] },
  farmacie: { en: 'pharmacy', alternatives: ['chemist'] },
  cabinet: { en: "doctor's office", alternatives: ['surgery'] },
  vaccin: { en: 'vaccine', alternatives: ['jab', 'shot'] },
  soldura: { en: 'hip' },
  glezna: { en: 'ankle' },
  incheietura: { en: 'wrist' },
  umar: { en: 'shoulder' },
  cauciuc: { en: 'tyre', alternatives: ['tire'] },
  volan: { en: 'steering wheel' },
  frana: { en: 'brake' },
  'centura de siguranta': { en: 'seatbelt' },
  benzinarie: { en: 'petrol station', alternatives: ['gas station'] },
  parcare: { en: 'parking', alternatives: ['car park'] },
  ambuteiaj: { en: 'traffic jam' },
  trecere: { en: 'crossing', alternatives: ['crosswalk'] },
  soricel: { en: 'mouse' },
  furtun: { en: 'hose' },
  surubelnita: { en: 'screwdriver' },
  ciocan: { en: 'hammer' },
  cui: { en: 'nail' },
  scara: { en: 'ladder', alternatives: ['stairs'] },
  umbrela: { en: 'umbrella' },
  portofel: { en: 'wallet' },
  geanta: { en: 'bag', alternatives: ['handbag'] },
  cheie: { en: 'key' },
  ghiozdan: { en: 'backpack' },
  pix: { en: 'pen' },
  creion: { en: 'pencil' },
  foarfeca: { en: 'scissors' },
  lipici: { en: 'glue' },
  factura_curent: { en: 'electricity bill' },
};

/** Normalizează un termen românesc pentru lookup: litere mici, fără diacritice, spații compacte. */
export function normalizeRo(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DICTIONARY: Map<string, RescueEntry> = new Map(Object.entries(RAW).map(([k, v]) => [normalizeRo(k), v]));

/** Caută un termen românesc în dicționarul-seed. Întoarce undefined dacă nu e acoperit. */
export function lookupRescue(roTerm: string): RescueEntry | undefined {
  return DICTIONARY.get(normalizeRo(roTerm));
}

export const RESCUE_DICTIONARY_SIZE = DICTIONARY.size;
