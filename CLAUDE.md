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
npm run deps         # install deps OUTSIDE OneDrive (C:\dev\jorgu-deps) + node_modules junction. Never run plain `npm install` here.
npm run deps -- -D some-pkg   # add a package
npm run dev          # Vite dev server (http://localhost:5173). /api arrives in M3 (Cloudflare Vite plugin then).
npm run build        # typecheck + production build (+ service worker) into dist/
npm run preview      # serve dist/ on http://localhost:4173
npm run test         # Vitest unit tests (tests/unit)
npm run test:e2e     # Playwright E2E (tests/e2e; builds + previews first)
npm run lint
npm run icons        # regenerate PWA icons from public/icon.svg
```

Why `npm run deps`: npm deletes a `node_modules` junction when it runs in the project, and OneDrive would otherwise sync ~18k dependency files.

## Deploy

Push to GitHub `main` (github.com/polxvii/JorGU) → Cloudflare Workers Builds deploys to https://jorgu.pv-proj.workers.dev. Single user, no preview branches (user decision 2026-11-09): work on `main`; once a milestone builds and local tests pass, push `main` so the user can test on the live URL, then report and wait. Never run `wrangler deploy` by hand unless asked.

Secrets: `npx wrangler secret put` (production), `.dev.vars` (local). `VITE_*` values: `.env.local` locally, Workers Builds build variables in production. All git-ignored. See spec §8.1, §18, §18a.
