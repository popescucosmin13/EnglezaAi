import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Hash-ul de commit: local din git; pe Vercel din env (doar la deploy-urile legate de git).
// La build-urile fără niciunul (vercel CLI remote build), rămâne doar versiunea + data build-ului.
function gitHash(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_FIREBASE_');
    const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
    const missing = required.filter(name => !env[name]?.trim());
    if (missing.length) {
      throw new Error(`Configurație Firebase lipsă: ${missing.join(', ')}. Configurează variabilele pentru Production în Vercel și rulează un nou deploy. Local, folosește .env.`);
    }
  }

  return {
  plugins: [react()],
  server: { port: 5199, host: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Firebase/React se schimbă rar față de codul aplicației — separate, browserul le
        // poate ține în cache peste mai multe deploy-uri în loc să le redescarce la fiecare.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router') || id.includes('node_modules/scheduler') || /node_modules\/react\//.test(id)) return 'vendor-react';
        },
      },
    },
  },
  optimizeDeps: { include: ['firebase/app', 'firebase/auth', 'firebase/firestore'] },
  define: {
    __APP_VERSION__: JSON.stringify(gitHash() ? `${pkg.version} (${gitHash()})` : pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  };
});
