# Development

Use Node.js 22.12+ and npm. Run `npm ci` in the root and `npm --prefix mobile ci` for the separate mobile dependency tree. Both dependency lockfiles are included; versions were not upgraded for this export.

Copy the environment templates and configure your own services. The web build requires Firebase API key, auth domain, project ID and app ID. Vite UI runs on port 5199; Vercel development runs the API. Configure a backend URL reachable by your mobile device.

Root `npm test` runs web/API tests and excludes mobile. Native tests run with `npm --prefix mobile test`. Run `npm run sync:check`, `npx tsc --noEmit` and `npm --prefix mobile run typecheck` after changes. `npm run build` checks shared files, typechecks, builds the PWA and stamps its service worker.

Inspect `scripts/shared-files.json` before changing shared learning logic. Deliberately use `npm run sync:from-web` or `npm run sync:from-mobile`, review the changes and check synchronization again. Platform-specific modules require separate changes.

Native builds need platform tooling or your own Expo account. Initialize your EAS project, choose app identifiers and configure SDK keys. Purchases require a native build and store configuration. No native signing credentials or installable releases are included.

Resolved versions: web React 18.3.1, Vite 5.4.21 and TypeScript 5.6.3; mobile Expo 57.0.18, React Native 0.86.3, React 19.2.3 and TypeScript 6.0.3. Firebase is 12.16.0, Firebase Admin 13.6.0 and Vitest 4.1.10. This version inventory is not a dependency vulnerability audit.
