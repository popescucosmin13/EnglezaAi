// Ștampilează dist/sw.js cu o versiune unică per build, ca browserul să detecteze mereu
// service worker-ul ca „nou" la fiecare deploy real și să-i declanșeze install/activate —
// altfel CACHE rămâne un literal fix, sw.js e byte-identic între deploy-uri, iar cache-ul
// vechi nu se mai curăță niciodată (simptomul „trebuie să șterg și să pun din nou PWA-ul").
//
//   node scripts/stamp-sw.mjs   → rulează după `vite build`, în dist/sw.js

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(root, 'dist', 'sw.js');

function gitHash() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

if (!existsSync(swPath)) {
  console.warn('dist/sw.js nu există — sar peste ștampilarea versiunii (rulează după `vite build`).');
  process.exit(0);
}

const version = gitHash() || Date.now().toString(36);
const content = readFileSync(swPath, 'utf8');
const stamped = content.replace(/const CACHE = '[^']*';/, `const CACHE = 'englezaai-${version}';`);
if (stamped === content) {
  console.warn('Nu am găsit linia `const CACHE = \'...\';` în dist/sw.js — verifică formatul.');
  process.exit(1);
}
writeFileSync(swPath, stamped);
console.log(`✓ dist/sw.js ștampilat: englezaai-${version}`);
