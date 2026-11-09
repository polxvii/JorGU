# JorGu

Dual-pane car dashboard PWA (landscape, right-hand-drive defaults). Full spec: `docs/SPEC.md` — read it before any milestone; it is the source of truth. Do not copy it here.

## Ground rules (non-negotiable)

1. Follow `docs/SPEC.md`. If current Google/YouTube docs disagree, follow the docs and tell the user what changed.
2. Build from scratch. Never copy code or assets from duoscreen.vercel.app or any repo claiming to clone it.
3. Official Google/YouTube APIs only. No scraping, InnerTube/`youtubei`, Invidious/Piped, unofficial TTS endpoints, or proxies that strip framing headers.
4. YouTube player rules (§3.9) are binding:
   - Nothing may overlap or hide a playing player (no headers, toasts, sheets, edge strips, drag ghosts over its rectangle).
   - Mini player ≥ 356×200; YouTube pane never narrower than 356 px.
   - Auto-advance only while the player is visible.
   - `Referrer-Policy: strict-origin-when-cross-origin` everywhere; never `no-referrer` / `noreferrer`.
   - Never CSS-scale or restyle the YouTube iframe.
5. Never re-parent iframes or the map container. Position surfaces with CSS only (§6.3). Keep surface render order stable (React reordering = DOM move = iframe reload); stack with `z-index`.
6. OAuth tokens stay server-side in the encrypted `jg_session` cookie. Never in localStorage, never sent to the client, never logged.
7. `[Verify]` items are unconfirmed: test them and report results. Don't guess.
8. Work milestone by milestone (§16). After each: run it, report against acceptance criteria, list untested `[Verify]` items, stop and wait for the user.

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · Zustand · `vite-plugin-pwa` · `idb-keyval` (API caches) · `@fontsource` IBM Plex Sans + IBM Plex Sans Thai · Cloudflare Worker with static assets (`worker/` handles `/api/*`, `wrangler.jsonc`) · Vitest (unit) · Playwright (E2E).

Main runtime: the in-app browser of a CarPlay browser app (CarTV / AP TV) on iPhone 16 Pro Max (spec §3.10). The app must work with no service worker and down to 430 px height.

All UI strings in `src/i18n/en.ts` (default) and `src/i18n/th.ts`; none hard-coded in components.

## Commands

```bash
npm install
npm run dev          # Vite + Cloudflare plugin: frontend and Worker /api together (http://localhost:5173)
npm run build        # typecheck + production build (+ service worker)
npm run preview      # serve the production build locally (Worker runtime)
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright E2E (builds + previews first)
npm run lint
```

## Deploy

Push to GitHub `main` → Cloudflare Workers Builds deploys. Other branches get preview URLs. Push only after the user approves a milestone. Never run `wrangler deploy` by hand unless asked.

Secrets: `npx wrangler secret put` (production), `.dev.vars` (local). `VITE_*` values: `.env.local` locally, Workers Builds build variables in production. All git-ignored. See spec §8.1, §18, §18a.
