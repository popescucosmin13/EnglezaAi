// Sincronizarea logicii partajate între web (src/) și nativ (mobile/src/).
//
//   node scripts/sync-shared.mjs check        → eșuează dacă vreun fișier partajat diferă
//   node scripts/sync-shared.mjs from-web     → copiază src/ → mobile/src/
//   node scripts/sync-shared.mjs from-mobile  → copiază mobile/src/ → src/
//
// „check" rulează automat în build-ul web și în typecheck-ul mobil, ca cele două
// aplicații să nu poată diverge pe fișierele de logică fără să se observe.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { shared } = JSON.parse(readFileSync(join(root, 'scripts', 'shared-files.json'), 'utf8'));

const mode = process.argv[2] ?? 'check';
if (!['check', 'from-web', 'from-mobile'].includes(mode)) {
  console.error(`Mod necunoscut: ${mode}. Folosește: check | from-web | from-mobile`);
  process.exit(2);
}

const webPath = (f) => join(root, 'src', f);
const mobilePath = (f) => join(root, 'mobile', 'src', f);

let diverged = [];
let copied = 0;

for (const f of shared) {
  const w = webPath(f);
  const m = mobilePath(f);
  if (!existsSync(w) || !existsSync(m)) {
    if (mode === 'from-web' && existsSync(w)) {
      mkdirSync(dirname(m), { recursive: true });
      writeFileSync(m, readFileSync(w, 'utf8'));
      copied++;
      console.log(`→ mobile/src/${f}`);
      continue;
    }
    if (mode === 'from-mobile' && existsSync(m)) {
      mkdirSync(dirname(w), { recursive: true });
      writeFileSync(w, readFileSync(m, 'utf8'));
      copied++;
      console.log(`→ src/${f}`);
      continue;
    }
    diverged.push(`${f} (lipsește în ${!existsSync(w) ? 'src/' : 'mobile/src/'})`);
    continue;
  }
  const webContent = readFileSync(w, 'utf8');
  const mobileContent = readFileSync(m, 'utf8');
  if (webContent === mobileContent) continue;

  if (mode === 'check') {
    diverged.push(f);
  } else if (mode === 'from-web') {
    writeFileSync(m, webContent);
    copied++;
    console.log(`→ mobile/src/${f}`);
  } else {
    writeFileSync(w, mobileContent);
    copied++;
    console.log(`→ src/${f}`);
  }
}

if (mode === 'check') {
  if (diverged.length > 0) {
    console.error('✗ Fișiere de logică partajată divergente între web și mobile:');
    for (const f of diverged) console.error(`   ${f}`);
    console.error('\nSincronizează cu: node scripts/sync-shared.mjs from-web  (sau from-mobile)');
    process.exit(1);
  }
  console.log(`✓ ${shared.length} fișiere partajate identice între src/ și mobile/src/.`);
} else {
  console.log(copied === 0 ? '✓ Nimic de copiat — deja identice.' : `✓ ${copied} fișiere sincronizate.`);
}
