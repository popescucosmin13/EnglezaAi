import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('loads admin reporting dependencies in Node ESM without a bundler', () => {
  const directory = mkdtempSync(join(tmpdir(), 'engleza-admin-esm-'));
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    for (const name of ['metrics', 'platforms']) {
      const source = readFileSync(fileURLToPath(new URL(`../src/admin/${name}.ts`, import.meta.url)), 'utf8');
      writeFileSync(join(directory, `${name}.js`), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
      }).outputText);
    }
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import { calendarDay, usersCsv } from './metrics.js'; console.log(calendarDay(new Date('2026-09-10T12:00:00Z'))); console.log(usersCsv([]));",
    ], { cwd: directory, encoding: 'utf8' });
    expect(output).toContain('2026-09-10');
    expect(output).toContain('Ultima platformă');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
