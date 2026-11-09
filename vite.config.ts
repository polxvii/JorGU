import { readFileSync, realpathSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Same headers as public/_headers so dev/preview behave like production (spec §3.9, §15).
const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

// node_modules is a junction to a folder outside OneDrive (scripts/deps.ps1); let the dev server read it.
function depsRealPath(): string[] {
  try {
    return [realpathSync('node_modules')];
  } catch {
    return [];
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/** CSP for `/*` from public/_headers, so `vite preview` (and the E2E tests) enforce the production policy. */
function productionCsp(): string | undefined {
  const lines = readFileSync('public/_headers', 'utf8').split('\n').map((l) => l.trimEnd());
  let inRoot = false;
  for (const line of lines) {
    if (!line.startsWith(' ')) inRoot = line.trim() === '/*';
    else if (inRoot && line.trim().toLowerCase().startsWith('content-security-policy:')) {
      return line.slice(line.indexOf(':') + 1).trim();
    }
  }
  return undefined;
}
const CSP = productionCsp();

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'JorGu',
        short_name: 'JorGu',
        description: 'Dual-pane car dashboard',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        theme_color: '#0d0f12',
        background_color: '#0d0f12',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + fonts only. Never /api, YouTube, Google Maps, or embedded sites (spec §14).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['probe/**', 'dev/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/probe\//, /^\/dev\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    headers: SECURITY_HEADERS,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...depsRealPath()] },
  },
  preview: { headers: CSP ? { ...SECURITY_HEADERS, 'Content-Security-Policy': CSP } : SECURITY_HEADERS },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Never inline fonts as data: URLs — CSP allows fonts from 'self' only.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
});
