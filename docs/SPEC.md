# JorGu — Dual-Screen Car Dashboard · Build Spec for Claude Code

> Version 0.5 · 2026-11-09
> UX reference: https://duoscreen.vercel.app/ ("CarPlay Multi-Screen Dashboard")

### Changes during M5 (2026-11-10)

- M5 (Web app) built before M4: M4 waited for the Maps billing decision (§19.4), since decided: mode A with the §7.1 cost rule.
- Live check (2026-11-10): DNS-over-HTTPS works from the Worker; example.com and wikipedia.org `allowed`, github.com `blocked` (CSP), youtube.com `blocked` (X-Frame-Options); localhost, 10.0.0.1, 169.254.169.254 rejected (400). google.com answers the Worker with a 429 bot page, so it comes out `unknown` and the iframe shows Google's refusal; Open in new tab still works.
- **Web pane header stays on screen** and holds the web controls: site name (opens the **Web menu**), Reload (or **Reload in this view** after a view change), Open in new tab. The site starts below a 56 px band, so no JorGu control covers it. In full screen the site gets the whole screen; the Web menu is on the floating bar (8th button).
- **Web menu** (sheet): address bar · Home · Reload · Open in new tab · Bookmark · view toggle (Auto + zoom, Mobile, Desktop + width 1024/1280/1440, help text) · Bookmarks (pin to App Picker, rename, delete) · Recent. An empty Web pane shows a start page with the address bar, bookmarks and Recent.
- Reload re-navigates the iframe to the page that was opened (a parent can't read a cross-origin frame's current URL). Picking "Web" again in the same session resumes that pane's last page. JorGu's own origin can't be opened in a Web pane.
- A typed `http://` address is checked as `https://`; if that can't be checked, a card offers Open in new tab (http) or Try https anyway.
- Frame check: DNS via Cloudflare DNS-over-HTTPS (`cloudflare-dns.com/dns-query`, JSON); a failed lookup fetches nothing (`unknown`). A 4xx/5xx page without framing headers is `unknown`. Only `allowed`/`blocked` are cached (7 days per origin, IndexedDB `jorgu-web`). Callers whose `Sec-Fetch-Site` is not `same-origin`/`none` get 403. Rate limit 10/min per client IP in Worker memory (per isolate, best effort): the Workers Rate Limiting binding isn't used because the docs don't confirm it on the Free plan.

### Changes during M2b (2026-11-10)

- **Top/bottom split** for upright phones, chosen in Settings → Split screen (Auto · Side by side · Top & bottom); portrait Dock, sheets and controls (§6).

- **YouTube home page:** the user asked for youtube.com's own signed-in home (recommendations) in the pane. Not possible: youtube.com sends `X-Frame-Options: SAMEORIGIN`, the Data API has no home/recommendations feed, and Developer Policies §III.I.1 forbid recreating the YouTube browse experience. User decision: a one-tap **library sheet** (Link · New · Playlists · Liked · Search · Music · Trending) plus an **"Open YouTube" button** that opens https://www.youtube.com/ in a new tab (§8.9).
- §8.1: PKCE (S256) added to the redirect flow. `/api/auth/me` answers `{connected:false, configured:false}` (200) when the server has no OAuth secrets.
- §8.2: the Worker returns `X-Quota-Units` (Data API units spent per request); the client sums them per Pacific day for "About N searches left today". Feed channel limit is 40, not 50: Workers Free allows 50 subrequests per request [Verify plan limit].
- §8.2: after `invalid_grant` (REAUTH) cached lists keep working until reconnection and age out after 30 days; on Disconnect they're deleted at once.
- §6: when a sheet leaves no free spot for a toast, the toast sits over the bottom of the sheet (never over the player).

### Changes in 0.5 (user decisions, 2026-11-09)

- **Target device:** iPhone 16 Pro Max, with JorGu opened in the in-app browser of a CarPlay browser app (CarTV / AP TV) and shown on the car's CarPlay screen. Safari and Chrome are secondary. New §3.10.
- **Navigation:** stays a hand-off to the Google Maps app, which gives voice guidance while JorGu is in front. New: the Map pane draws a **route overview** (route line, live position, ETA, distance left), with no turn instructions or voice from Google route data (§7.4).
- Checked against current docs: Google Maps Platform Terms (last modified 2026-08-26) §3.2.3(d) forbid building "real-time navigation functionality substantially similar to" the Google Maps app, and the terms have no personal-use exemption. Navigation SDK has no web version. `google.com/maps` sends `X-Frame-Options: SAMEORIGIN` (tested 2026-11-09), so it can't be embedded.
- Rejected: OSM-based in-app turn-by-turn; Waze Live Map embed (Waze guidelines forbid pairing with non-Waze maps); screen mirroring (not possible from a web page); unofficial Google tile URLs.
- §12.1, §14, §17, §19 updated for the target device.
- **Milestones:** M3 (OAuth + library) merged into M2. New §8.8 privacy policy, required by the YouTube Developer Policies.
- **Hosting:** Cloudflare Worker with static assets instead of Vercel, auto-deployed from GitHub `main` by Workers Builds (§4, §5, §8.1, §18, new §18a).
- Spec file moved to `docs/SPEC.md`.

## 0. Instructions for Claude Code

1. Read this whole file first. Build milestone by milestone (§16). After each milestone, run it, summarize what works and what doesn't, and wait for the user to review before continuing.
2. Build from scratch. Do not copy code, JS bundles, or assets from duoscreen.vercel.app or from any repository that claims to clone it. Use the original only as a UX reference.
3. If screenshots exist in `docs/reference/`, use them as the layout reference.
4. Use official Google/YouTube APIs only. No scraping YouTube pages, no InnerTube/`youtubei`, no Invidious/Piped, no unofficial endpoints (including the Google Translate TTS endpoint). No proxy that strips framing headers from third-party sites (§9.4).
5. Items tagged **[Verify]** are not confirmed. Test them, report results, and do not guess.
6. If current Google documentation contradicts this spec, follow the documentation and tell the user which part changed.

### Provenance tags

| Tag | Meaning |
|---|---|
| [Official] | Confirmed in Google/YouTube documentation |
| [Secondary] | From articles, caniuse, or third-party READMEs |
| [Proposal] | A design decision, not a fact; may be changed |
| [Verify] | Unconfirmed; must be tested on real devices or checked in docs |

---

## 1. What is known about the original

The original is a JavaScript-only SPA. Fetching it returns only metadata: title "CarPlay Multi-Screen Dashboard", `theme-color #0b0f19`, `apple-mobile-web-app-capable: yes`, zoom-locked viewport. **The actual UI has not been inspected visually.**

The feature list below comes from the README of a third-party repo, `github.com/hituongvypham-hue/duo-screen-car`, which claims to be a 100% clone (not the original author) [Secondary]:

- View modes: HUB, Map, Split, full-screen Media
- Six HUD themes: Carbon Sport, Racing M-Sport, Cyberpunk Neon, Eco Emerald, Classic Amber HUD, Stealth Matte Black
- Vietnamese voice alerts (entering/leaving residential zones, overspeed) via a Google Translate TTS proxy
- VTV Go live TV (Vietnamese channels) — **removed from this project**
- Song library + YouTube player: search or paste a YouTube link, Vietnamese voice search, steering-wheel media keys
- Backend: Vercel serverless `api/yt-search.js`, `api/tts.js` · Frontend: React + Tailwind

**Unknown:** how the original detects residential zones, which map provider it uses, and whether `yt-search` uses the official API. This spec does not depend on any of these.

## 2. Goals / Non-goals

**Goals**
- UI in English (default) and Thai, switchable in Settings
- User-arranged panes: the user picks which app shows in each pane and swaps panes freely (§6)
- One-tap full screen for any pane (§6.5)
- Google Maps as the map (§7), with a route overview while the Google Maps app gives voice guidance (§7.3–7.4)
- Runs in the in-app browser of CarPlay browser apps (CarTV / AP TV) on iPhone 16 Pro Max (§3.10)
- YouTube tied to the user's own Google account (§8)
- A Web app that opens any URL the target site allows to be embedded, with Mobile / Desktop view (§9)
- Landscape PWA for car screens, tablets, and phones
- Right-hand-drive defaults (Thailand): driver-facing controls on the right side of the screen

**Non-goals**
- In-app turn-by-turn navigation (hand off to the Google Maps app)
- Live TV feature (dropped; YouTube live streams can still be played via link or search)
- Multiple user accounts
- Blocking YouTube ads, or bypassing sites that refuse to be embedded

---

## 3. Platform constraints that drive the design

### 3.1 YouTube "login" has two separate layers

| Layer | What it enables | Mechanism |
|---|---|---|
| A. Account data | Subscriptions, playlists, liked videos, search | Google OAuth + YouTube Data API v3 |
| B. Playback as the user | Premium benefits / no ads, watch history | youtube.com cookies in the browser, read by the IFrame player — **not the OAuth token** |

- Google Help: for videos embedded on other websites, YouTube cookies must not be blocked [Official] — https://support.google.com/youtube/answer/7437519
- Chrome keeps third-party cookies on by default (Google decision, 22 Apr 2025); Safari and Firefox block them by default [Secondary]
- Expected: Chrome on Android → layer B likely works · Safari on iPhone → likely does not unless Prevent Cross-Site Tracking is off [Verify]
- The app cannot detect layer B status from code (cross-origin), so it provides a manual checklist (§8.6)

### 3.2 YouTube Premium Lite still shows ads on music

Google states Premium Lite may still show ads on music content, Shorts, and when searching or browsing [Official] — https://support.google.com/googleone/answer/17101453. If the user mainly plays music in the car, ads will appear even when layer B works. The app cannot change this.

### 3.3 YouTube Data API gaps

- Watch history and Watch Later: return empty lists since Sept 2016 [Official, via secondary sources quoting the revision history] — https://developers.google.com/youtube/v3/revision_history
- Personal home feed / recommendations: no endpoint found [Verify in current docs]
- Substitute: "New from subscriptions" feed (§8.2) + playlists + liked videos

### 3.4 YouTube quota

- Default per project: 100 `search.list` calls/day (separate bucket) and 10,000 units/day for all other endpoints; most `*.list` calls cost 1 unit [Official] — https://developers.google.com/youtube/v3/determine_quota_cost
- Every voice search is a search call → always search the user's own library first (§8.4)
- Quota resets at midnight Pacific Time [Secondary]

### 3.5 OAuth "Testing" publishing status

- Up to 100 test users; authorizations expire 7 days after consent, including refresh tokens [Official] — https://support.google.com/cloud/answer/15549945
- The user must reconnect every 7 days → the UI must handle this cleanly (§8.1)
- Alternative: publish to "In production" unverified. Google says verification may be required before requesting sensitive scopes [Official]; personal use reportedly works behind an "unverified app" warning [Secondary, Verify]. Default: Testing.

### 3.6 Embedding arbitrary websites

- Sites control whether they can be shown in an iframe via `X-Frame-Options` (`DENY` / `SAMEORIGIN`) or CSP `frame-ancestors`; when both are present, modern browsers use `frame-ancestors` [Secondary, consistent with MDN]
- The restriction is enforced by the framed site's server. **This app cannot override it** from the iframe tag.
- Expected to refuse embedding: google.com/maps, youtube.com watch pages, most banking and social sites [Verify with §9.3]
- Therefore: Google Maps uses the Maps JavaScript API (§7), YouTube uses the IFrame Player API (§8), and everything else goes through the Web app with a pre-check and an "Open in new tab" fallback (§9)

### 3.7 Google Maps Platform cost

- Maps JavaScript API bills the "Dynamic Maps" SKU: 10,000 free events/month, then USD 7.00 per 1,000 (first band) [Official] — https://developers.google.com/maps/billing-and-pricing/pricing
- Maps Embed API: no charge, unlimited, but needs an API key [Official] — https://developers.google.com/maps/documentation/embed/usage-and-billing
- Maps URLs (deep links into the Google Maps app): no API key needed [Official] — https://developers.google.com/maps/documentation/urls
- A billing account on the Cloud project is required to use Maps APIs [Verify]

### 3.8 Voice input on iOS

Safari supports `webkitSpeechRecognition` only with Siri enabled, and caniuse notes it is unavailable in web apps added to the Home Screen [Secondary, Verify]. A text-input fallback is mandatory.

### 3.9 YouTube embedded player rules (binding)

From YouTube API Services — Required Minimum Functionality (last updated 2026-11-06) [Official] — https://developers.google.com/youtube/terms/required-minimum-functionality

| Rule | Consequence for this app |
|---|---|
| No overlays, frames, or other visual elements in front of any part of the player, including controls; nothing may obscure it | No card covering the video while driving; no edge strip or floating buttons over the player; no other app surface on top of a playing player (§6.6) |
| Automatic/scripted playback must not start until the player is visible and more than half of it is on screen | Auto-advance to the next track only while the player is visible (§6.6) |
| Player viewport at least 200×200 px; if controls are shown they must fit; 16:9 recommended at least 480×270 | Mini player ≥ 356×200 (16:9); YouTube pane never narrower than 356 px (§6.1) |
| Player must send an HTTP Referer; don't suppress it via `Referrer-Policy` | App sends `Referrer-Policy: strict-origin-when-cross-origin`; never `no-referrer` (§15); handle player error 153 (missing Referer) |
| No changes to the player beyond what the API documents | Never CSS-scale or restyle the YouTube iframe (the §9.7 scaling applies to the Web app only) |
| At most one auto-playing YouTube player per screen | Singleton player (§6.1) |

Also: the IFrame API no longer supports setting playback quality [Official, IFrame API revision history], so the app cannot reduce video data use.

### 3.10 Target browser: CarPlay browser apps on iPhone

JorGu's main runtime is the in-app browser of a third-party CarPlay app (CarTV / AP TV) on an iPhone 16 Pro Max, displayed on the car's CarPlay screen. On iOS this is a `WKWebView` inside that app, not Safari. Capabilities depend on how the host app configures it, so every item below is [Verify] (test with the M0 probe page):

| Capability | Expected | If missing |
|---|---|---|
| Viewport = CarPlay screen size, touch input works | Yes | — (blocking) |
| `navigator.geolocation` (speed, map position) | Depends on host app permission | Speed and position hidden; map still works by search |
| `localStorage` persists between launches | Likely | Settings reset each launch |
| Service worker | Unlikely (`WKWebView` allows it only for App-Bound Domains [Secondary]) | App must work fully without a service worker |
| Element full screen (§6.5 layer 2) | Unlikely | Layer 1 only (fine: no browser UI on CarPlay anyway) |
| YouTube IFrame player plays, Referer sent | Likely | — (blocking) |
| youtube.com cookies in the embedded player (§3.1 layer B) | Unlikely (separate cookie store from Safari; tracking prevention) | Ads shown; checklist says so |
| `speechSynthesis` with a Thai voice | Likely | Visual alerts only |
| `SpeechRecognition` | Unlikely | Text input (§11) |
| Opening Google Maps app from a link (`https://www.google.com/maps/dir/?api=1…` or the iOS `comgooglemaps://` scheme) | Depends on host app | Show the destination and "Open Google Maps yourself" |
| Google Maps app keeps speaking guidance while the CarPlay browser app is in front | Likely | Route overview only, no voice |

Screen: CarPlay screen sizes vary by car (e.g. 800×480, 1280×720, 1920×720). iPhone 16 Pro Max landscape is ≈ 932×430 CSS px with side safe-area insets [Verify].

---

## 4. Tech stack [Proposal]

- React 18+ · Vite · TypeScript · Tailwind CSS
- `vite-plugin-pwa`
- Cloudflare Worker with static assets: the Worker serves the Vite build and handles `/api/*` (OAuth, YouTube proxy, frame-check). Deployed by Cloudflare Workers Builds on every push to GitHub `main`; other branches get preview URLs. Local dev via `@cloudflare/vite-plugin`. (Changed from Vercel in 0.5.)
- Zustand for state · `localStorage` for settings · IndexedDB (`idb-keyval`) for API caches
- Google Maps: `@googlemaps/js-api-loader` (or `google.maps.importLibrary`)
- Fonts: IBM Plex Sans Thai + IBM Plex Sans (self-hosted via `@fontsource`, offline-safe)
- No Supabase in v1 (single user)

## 5. Project structure [Proposal]

```
jorgu/
├── wrangler.jsonc            # Worker config: assets = dist/, SPA fallback, run_worker_first for /api/*
├── worker/
│   ├── index.ts              # router for /api/*
│   ├── lib/
│   │   ├── session.ts        # AES-256-GCM cookie encrypt/decrypt (Web Crypto)
│   │   ├── google.ts         # code exchange, token refresh, revoke
│   │   ├── yt.ts             # Data API wrapper, 401/quota handling
│   │   └── ssrf.ts           # URL + IP validation for frame-check (DNS via DNS-over-HTTPS)
│   ├── auth/  login.ts · callback.ts · logout.ts · me.ts
│   ├── yt/    subscriptions.ts · feed.ts · playlists.ts · playlist-items.ts · liked.ts · search.ts · videos.ts
│   └── frame-check.ts
├── src/
│   ├── shell/                # PaneGrid, PaneHeader, Dock, AppPicker, LayoutStore
│   ├── apps/
│   │   ├── dashboard/        # HUD: speed, clock, now playing, shortcuts
│   │   ├── map/              # Google Maps (mode A/B), destinations
│   │   ├── youtube/          # player, queue, library, search
│   │   └── web/              # URL bar, bookmarks, iframe, frame-check client
│   ├── features/  alerts/ · voice/ · settings/ · geo/
│   ├── i18n/      th.ts · en.ts
│   ├── theme/     themes.ts
│   └── lib/       parseYouTubeUrl · normalizeUrl · cache
├── public/
└── docs/reference/           # screenshots of the original (user adds)
```

---

## 6. Pane system (core feature)

### 6.1 Concepts

- **Layout**: `single` (one pane) or `split` (two panes, vertical divider draggable between 30% and 70%). Stretch goal: `triple` (one large pane + two stacked).
- **Split direction (user request 2026-11-10)**: setting `layout.direction` = `auto` (default) · `side` · `stacked`. `auto` stacks the panes top/bottom when the screen is taller than wide (phone upright) and puts them side by side otherwise. Stacked: the divider is horizontal, and the YouTube pane must fit a ≥ 356×200 player plus its band and controls (≥ 345 px tall, ≥ 356 px wide), otherwise one pane. The pane that is on the left side by side goes on top.
- **Portrait screens** (any direction): the Dock is a row along the bottom; sheets are full-width bands from the bottom (from the top when YouTube is the bottom pane or the mini player shows); YouTube full-screen controls are a row along the bottom; full-screen floating controls are a grid at the top. Pane chrome that would cross the mini player is trimmed beside it or hidden while it shows. The 480×270 mini player falls back to 356×200 where it doesn't fit.
- **App**: `dashboard`, `map`, `youtube`, `web` (each web instance carries its own URL)
- **Assignment**: which app is in which pane, persisted

Rules:
- `map` and `youtube` are singletons (one instance each — one map load, one audio source). Assigning a singleton that is already visible in the other pane performs a swap.
- `web`: at most one instance per pane, each with its own URL.
- Apps not currently visible stay mounted. Exception: while YouTube is playing it is never hidden — it becomes the mini player (§6.6).
- A pane holding YouTube is never narrower than 356 px; the divider stops there (§3.9). On screens too small for that in `split`, YouTube can only be in `single` or the mini player.

### 6.2 Interactions

| Action | Result |
|---|---|
| Tap pane header "Change" | App Picker sheet: Dashboard, Map, YouTube, Web, plus saved bookmarks as one-tap entries |
| Tap ⇄ in Dock | Swap the two panes' contents |
| Drag one pane header onto the other pane | Swap |
| Tap ⛶ on a pane (or double-tap its header) | That pane goes full screen (§6.5) |
| Tap layout button in Dock | Toggle `single` ↔ `split` |
| Drag divider | Resize; snap points at 40/50/60% |
| Voice "swap" / "สลับจอ" | Swap |

Pane headers are slim (≤ 40 px) and auto-hide after 4 s of no touch; tap the pane edge to reveal [Proposal]. The ⛶ button is the exception: it stays visible as a translucent 48 px button in the pane's top corner nearest the driver, so full screen is always one tap away.

### 6.3 Implementation rule (critical)

Removing an iframe from the DOM and inserting it elsewhere reloads it, which would stop YouTube playback and reset web pages. Therefore:
- Render each app surface **once**, inside a single fixed container.
- Position surfaces with CSS (`grid-area` or absolute positioning computed from the assignment). **Never re-parent iframes or the map container.**
- Hidden surfaces (Dashboard, Map, Web): `visibility: hidden` + `pointer-events: none`, kept mounted. The YouTube surface is never hidden or covered while playing; it is repositioned as the mini player instead (§6.6). If YouTube is paused and not assigned to a visible pane, it may be hidden.
- Stacking order: the YouTube surface is always the top layer among app surfaces, and no app UI (headers, floating bars, toasts, sheets) may be placed over its rectangle. Sheets and toasts position themselves around it.
- After a resize or swap, re-center the map once the transition ends [Verify whether the Maps JS API handles container resize automatically].

### 6.4 Defaults

`split`, 50/50 · left pane: YouTube · right pane: Map (driver side) · Dock on the right edge. Setting `driverSide: 'left'` mirrors everything.

```
split (default, driverSide = right)
┌─────────────────────────────┬─────────────────────────────┬────┐
│ ▸ YouTube     [Change]  ⛶   │ ▸ Map         [Change]  ⛶   │ ⌂  │
│ ┌─────────────────────────┐ │                             │ ⇄  │
│ │ video / artwork          │ │          ● you              │ ◫  │
│ └─────────────────────────┘ │                             │ 🎤 │
│ Song title · Channel        │                 ┌────────┐  │ ⚙  │
│   ⏮      ⏯      ⏭          │                 │   72   │  │    │
│                             │                 │  km/h  │  │ ♫▸ │
└─────────────────────────────┴─────────────────┴────────┴──┴────┘
```

### 6.5 Per-pane full screen

**Entering:** tap ⛶ on any pane (or double-tap its header, or say "full screen" / "เต็มจอ"). That pane fills the whole screen; the other pane, pane headers, and the Dock are hidden. The hidden app keeps running; if it is a playing YouTube, it shows as the mini player (§6.6).

**Two layers, applied together** [Proposal]:
1. **In-app full screen** (always works): CSS makes the chosen surface cover the app area. No DOM moves (§6.3), so nothing reloads.
2. **Browser full screen** (hides the browser's address bar/status bar): `document.documentElement.requestFullscreen()` called in the same tap handler. Request it on the app root, **not** on the pane or iframe, so our floating controls (below) remain visible inside the fullscreen element.

| Situation | Layer 1 | Layer 2 |
|---|---|---|
| Chrome / Android head unit, in a browser tab | ✓ | ✓ |
| Installed PWA already in `display: fullscreen` | ✓ | skip (already full screen) |
| iPhone Safari | ✓ | ✗ element full screen is not supported on iPhone (iPad only) [Secondary] → advise installing to Home Screen to hide Safari's UI |
| Voice command | ✓ | skip — browsers require a user gesture for `requestFullscreen` [Secondary] |

**While full screen — floating controls:** a tap on the edge strip (or a tap when the surface is the Map/Dashboard) shows, for 4 s, a floating bar on the driver side with large (≥ 64 px) buttons:
- **Exit full screen** (✕)
- **⇄ Switch** — puts the *other* pane's app full screen instead (fast Map ↔ YouTube flip while staying full screen)
- **App picker** — choose which app is full screen
- YouTube controls (⏮ ⏯ ⏭) when YouTube is not the full-screen app

Edge strip: on Web surfaces, taps go to the iframe, so a transparent ≈ 24 px strip along the driver-side edge sits above the iframe to summon controls [Proposal; Verify it doesn't block site scrollbars].

**YouTube full screen is laid out differently** (§3.9 forbids anything in front of the player): the player gets the screen minus a permanent control column (≈ 72 px) on the driver side. The edge strip and floating buttons live in that column, beside the player, never on top of it. The player stays 16:9-letterboxed inside its rectangle.

### 6.6 YouTube mini player

When YouTube is playing but not assigned to a visible pane (another app is full screen, or `single` layout shows another app):
- The YouTube surface is repositioned (CSS only, §6.3) to a corner on the **passenger side**, size 356×200 (16:9) by default; user can pick 356×200 / 480×270 in Settings
- It sits above the other app's surface; nothing is drawn over it. Floating bars, toasts, and the map's own controls (ours) avoid its rectangle
- Tap the mini player's adjacent handle (outside the player) to bring YouTube back into a pane
- Auto-advance to the next queue item happens only while the player is visible (full pane or mini player). Since the mini player is always visible while playing, auto-advance keeps working
- When the user pauses, the mini player can be dismissed (hidden) — a paused, hidden player is allowed
- While driving, video plays normally in whatever pane or mini player it is in (user decision, 2026-11-09). There is no driving-mode video cover.

**Exiting:** ✕ button, `Esc`, voice "exit full screen" / "ออกจากเต็มจอ", or the Android back gesture. On entering, push a history entry (`history.pushState`) so Back exits full screen instead of leaving the app. If the browser leaves full screen by itself (`fullscreenchange` with no `fullscreenElement`), also exit in-app full screen so states never disagree.

**Inside-iframe full screen:** YouTube's own player full-screen button and sites' own full-screen buttons still work (`allow="fullscreen"` on both iframes). Those are the site's own behavior and exit back to our layout.

**Persisted:** `layout.fullscreenPane: 0 | 1 | null` — restored on reload (layer 1 only; layer 2 needs a new tap).

---

## 7. Map app (Google Maps)

### 7.1 Mode A — Maps JavaScript API (default)

- One `google.maps.Map` instance for the app's lifetime (each new instance is another billable load) [Verify exactly what counts as a Dynamic Maps event]
- Options: `mapId` (needed for Advanced Markers), `disableDefaultUI: true` with our own large controls, `gestureHandling: 'greedy'`
- `colorScheme`: `LIGHT` / `DARK` following the app's night mode (`google.maps.ColorScheme` exists in the API reference [Official]) [Verify whether it can change after init; if it requires re-init, only re-init on night-mode change]
- Current position: `AdvancedMarkerElement` with a heading arrow; follow mode on by default; dragging the map pauses follow and shows "Back to my location"
- `TrafficLayer` toggle
- Speed readout overlaid in the corner nearest the driver
- **Cost rule (user decision 2026-11-10, binding):** never more than **9,500 billed events per calendar month for each billed SKU** (Dynamic Maps for map loads; Routes "Compute Routes Essentials" for the route overview), below the 10,000 free. When the next event would pass 9,500, or Google refuses a load for quota, the app switches to **mode B** (Embed, no charge) until the month resets; the route overview falls back to the Embed directions view.
  - Hard guard (can't be bypassed by a bug or a second device): in Cloud Console, cap each billed API at **306 requests/day** (306 × 31 = 9,486) [Verify the quota names and that a per-day cap exists for the Routes API; if it doesn't, the app counter is the guard and the cap goes per minute].
  - App counter: counts its own map loads and route requests per month (Pacific time, like Google's billing) in localStorage and switches to mode B at 9,500. Per device only, which is why the hard guard exists.
  - Budget alert at USD 1 as an early warning (alerts don't stop charges).

### 7.2 Mode B — Maps Embed API (zero-cost fallback)

- iframe `https://www.google.com/maps/embed/v1/view?key=<KEY>&center=<lat,lng>&zoom=15` [Verify URL/params in docs]
- No live follow; "Recenter" reloads the iframe with the current position
- Setting: `map.mode: 'js' | 'embed'` for users who do not want a billing-enabled key

### 7.3 Navigation handoff

- Destination input + saved places (Home, Work, custom) + recent destinations
- "Navigate" opens: `https://www.google.com/maps/dir/?api=1&destination=<encoded>&travelmode=driving&dir_action=navigate` [Official; Verify it opens the app on the target device]. If the in-app browser doesn't open the app from that link, try the iOS URL scheme `comgooglemaps://` [Verify in docs and on device]; if neither works, show the destination with "Open Google Maps yourself".
- The same tap also starts the route overview (§7.4) in the Map pane.
- Expected flow on CarPlay: tap Navigate in JorGu → Google Maps starts guidance on the CarPlay screen → user taps the CarTV/AP TV icon to return → JorGu shows YouTube + route overview while Google Maps keeps speaking [Verify].
- No Places Autocomplete in v1 (extra billed SKU); plain text destination is passed to Google Maps, which resolves it
- Not in scope: turn-by-turn instructions or voice guidance inside the app (Google Maps Platform Terms §3.2.3(d), checked 2026-11-09).

### 7.4 Route overview [Proposal]

Shown in the Map pane (mode A only) after "Navigate":
- Route line from the current position to the destination, from the Routes API [Verify exact API: Maps JS `Route.computeRoutes` vs Routes API REST, field mask, and billed SKU / free monthly cap]
- Live position marker (follow mode), ETA, distance left, traffic layer on
- **Not shown:** maneuver list, next-turn arrow, or spoken instructions built from Google route data
- Recompute only when the user taps "Refresh route" or is > 200 m off the line, at most once per 60 s [Proposal]; cache nothing beyond the current session (Terms §3.2.3(a) no caching)
- "End route" clears it. Mode B (Embed) can instead show `/maps/embed/v1/directions` with origin = current position (static, no follow)

---

## 8. YouTube app

### 8.1 OAuth (layer A)

**Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` (`https://jorgu.pv-proj.workers.dev/api/auth/callback`), `SESSION_SECRET` (32 random bytes, base64), `APP_ORIGIN`. Secrets are set with `npx wrangler secret put` (production) and `.dev.vars` (local, git-ignored); non-secret values go in `wrangler.jsonc` `vars`. [Verify Google accepts a `workers.dev` redirect URI]

**Scopes:** `openid email profile https://www.googleapis.com/auth/youtube.readonly` (read-only)

**Added 2026-11-10 — device flow as a fallback [Official]:** Google blocks OAuth in embedded WebViews (`disallowed_useragent`; WKWebView named explicitly). The block is based on the browser's user agent; the user reports that Google sign-in already works inside CarTV, so CarTV may present a Safari-like user agent [Verify with the M0 probe `env.userAgent`]. JorGu therefore offers the redirect flow first and "Use a code instead" as a fallback. Google's *OAuth 2.0 for TV and Limited-Input Devices* flow allows `youtube.readonly`, `openid`, `email`, `profile`, and always returns refresh tokens. JorGu uses it everywhere:
1. `POST /api/auth/device/start` → `https://oauth2.googleapis.com/device/code` → the client shows the `user_code` and `verification_url` (google.com/device); `device_code` stays server-side in an encrypted, httpOnly 30-min cookie
2. The user opens google.com/device on any browser (e.g. Safari on the same iPhone), enters the code, and approves
3. `POST /api/auth/device/poll` (client polls at Google's `interval`) → token endpoint with `grant_type=urn:ietf:params:oauth:grant-type:device_code`; `authorization_pending` → keep waiting, `slow_down` → +5 s, `access_denied` / `expired_token` → stop → on success the session cookie is set exactly as in step 2 below
4. Needs a second OAuth client of type **TVs and Limited Input devices**: `DEVICE_CLIENT_ID` (var) and `DEVICE_CLIENT_SECRET` (secret). The web client (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) stays for the redirect flow below.

**Flow (authorization code, refresh token server-side):**
1. `GET /api/auth/login` → random `state` and PKCE `code_verifier` sealed in a 10-min httpOnly cookie → redirect to Google with `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, `code_challenge` (S256)
2. `GET /api/auth/callback` → verify `state` → exchange code → store `{refresh_token, access_token, expires_at, email, name, picture}` encrypted in cookie `jg_session` (httpOnly, Secure, SameSite=Lax, Max-Age 180 days) → redirect to `/`
3. Each `/api/yt/*` call: decrypt cookie → refresh if < 60 s left → re-set cookie → call the Data API
4. `POST /api/auth/logout` → revoke at `https://oauth2.googleapis.com/revoke` → clear cookie
5. `GET /api/auth/me` → `{connected, email, name, picture}` (never tokens)

Tokens never reach the client, never go in localStorage, never get logged.

**Expiry (every 7 days in Testing):** Google returns `invalid_grant` → server clears cookie → `401 {code: "REAUTH"}` → client shows a top banner "YouTube connection expired · Reconnect". Queue and cached playlists keep working until reconnection.

### 8.2 Data endpoints (server proxy)

| Endpoint | Data API call | Quota | Client cache TTL [Proposal] |
|---|---|---|---|
| `GET /api/yt/subscriptions` | `subscriptions.list mine=true part=snippet maxResults=50` (all pages) | 1/page | 6 h |
| `GET /api/yt/feed` | `channels.list part=contentDetails` (50 ids/call) → `playlistItems.list` on each uploads playlist, 5 items each | ≈ ⌈n/50⌉ + n | 30 min |
| `GET /api/yt/playlists` | `playlists.list mine=true` | 1/page | 1 h |
| `GET /api/yt/playlist-items?id=` | `playlistItems.list` | 1/page | 1 h |
| `GET /api/yt/liked` | `videos.list myRating=like` | 1/page | 1 h |
| `GET /api/yt/search?q=` | `search.list type=video regionCode=TH relevanceLanguage=<ui lang> maxResults=20` | 1 search call | 24 h per query |
| `GET /api/yt/popular?category=` | `videos.list chart=mostPopular regionCode=TH [videoCategoryId]` | 1 | 1 h |
| `GET /api/yt/categories?lang=` | `videoCategories.list regionCode=TH hl=<lang>` | 1 | 24 h |
| `GET /api/yt/videos?ids=` | `videos.list part=snippet,contentDetails` (50 ids/call) | 1 | 6 h |

- `feed`: limit channels by setting `feedChannelLimit` (default 50) using `subscriptions.list order=relevance`; merge and sort by `publishedAt` desc; drop private/deleted items
- `search`: client counts today's searches (Pacific day) and shows "About N searches left today"; on `quotaExceeded` show "Today's search limit is used up · Search your library or paste a link instead"
- Client caching complies with the YouTube API Services Developer Policies §III.E.4 (checked 2026-11-09): Authorized Data must be deleted or refreshed within 30 calendar days; Non-Authorized Data (search results, video details) may be stored temporarily for at most 30 days. All TTLs above are ≤ 24 h; the IndexedDB cache also drops any entry older than 30 days.
- On disconnect (§8.1 step 4) the client deletes all cached account data immediately (policy: revoke right away, delete within 7 days). If Google reports `invalid_grant` (revoked from Google's security page), cached account data is deleted too (policy: within 30 days).

### 8.8 Privacy policy (required before connecting) [Official]

YouTube API Services Developer Policies §III.A.2 (checked 2026-11-09) require, for apps using Authorized Data:
- A privacy policy the user agrees to before using the account features, prominently displayed and always accessible (Settings → Privacy, and on the Connect screen)
- It links to the Google Privacy Policy (https://policies.google.com/privacy) and states that the app uses YouTube API Services (https://www.youtube.com/t/terms)
- It explains that access can be revoked in the app (Disconnect) and at Google's security settings page: https://security.google.com/settings/security/permissions
- It explains what is stored (encrypted session cookie on the server side; account data cached on the device ≤ 24 h) and how to contact the owner
- Served as a static page `/privacy` (en + th). "Connect YouTube account" shows "By connecting you agree to the Privacy Policy" with a link; consent is recorded locally with a timestamp.

### 8.3 Paste a link (no quota)

`parseYouTubeUrl()` supports `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/`, `m.youtube.com`, `music.youtube.com/watch?v=`, and `playlist?list=` (→ `playlist-items`). Unit tests cover every form.

### 8.4 Library-first search (no search quota)

Index titles from cached playlists + liked videos → fuzzy match locally first (Thai has no spaces: use `Intl.Segmenter('th', {granularity: 'word'})` or substring match) → show "From your library" results first, with a separate "Search YouTube" button.

### 8.5 Player

- YouTube IFrame Player API from `https://www.youtube.com/iframe_api`, host `www.youtube.com` (not `youtube-nocookie.com`, because layer B needs youtube.com cookies) [Verify]
- `playerVars`: `playsinline: 1`, `rel: 0`, `enablejsapi: 1`, `origin: APP_ORIGIN`
- Singleton player (§6.1); first play must come from a user tap (autoplay policy); afterwards `loadVideoById` for the queue [Verify]
- Queue: `{items, index, repeat: 'off'|'all'|'one', shuffle}` in localStorage; `ENDED` → next
- Errors: 101/150 (embedding disabled by owner) → auto-skip + toast "Skipped: the owner doesn't allow playback outside YouTube" with "Open in YouTube app"; 100 → skip + "Video removed or private"; 153 (missing Referer) → do not retry in a loop, log it and show "Player blocked: app identity missing" — this indicates a `Referrer-Policy` bug (§15)
- **Playback speed (user request 2026-11-10):** one-tap speed button outside the player cycles 1× → 1.5× → 2× (1.25× dropped at the user's request) (only rates returned by `getAvailablePlaybackRates()`; live streams stay 1×). The chosen rate is remembered (`youtube.playbackRate`) and re-applied to every new video with `setPlaybackRate` [Official IFrame API]. Also in Settings, on the mini-player handle, and in the full-screen controls. If the user changes speed in YouTube's own menu, `onPlaybackRateChange` updates the saved rate.
- Media keys [Verify]: `navigator.mediaSession.setActionHandler` for `play`, `pause`, `nexttrack`, `previoustrack` + `metadata`; also `keydown` for `MediaPlayPause`, `MediaTrackNext`, `MediaTrackPrevious`. Risk: audio comes from a cross-origin iframe that may own the media session. Test and report.

### 8.6 "Signed-in playback" checklist (layer B)

Not detectable in code, so Settings shows a checklist:
1. "Open youtube.com to sign in" (new tab, same browser)
2. Browser-specific advice: Chrome → allow cookies for `[*.]youtube.com` · Safari → explain that Prevent Cross-Site Tracking blocks it
3. "Play a test video" (non-music) → ask "Did you see an ad?" → store result and show status
4. Note: test with non-music content, because Premium Lite may show ads on music anyway (§3.2)

### 8.7 Video while driving

No driving mode. Video keeps playing normally while the car moves (user decision). Do not add any overlay, blur, or cover on the player for any reason (§3.9). Player controls (`controls: 1` default) stay usable; our own ⏮ ⏯ ⏭ live outside the player rectangle.

---

### 8.9 Library sheet and "Open YouTube" (user decision 2026-11-10)

- The transport row's **Library** button opens a sheet (placed by the layout engine, never over the player) with tabs: **Link** (paste, §8.3) · **New** (feed) · **Playlists** (→ items, Play all) · **Search** (§8.4; liked videos are searched too, but have no tab of their own: user decision 2026-11-10) · **Trending** (`chart=mostPopular`, region TH, with category chips from `videoCategories.list regionCode=TH hl=<ui lang>` (assignable only, Music first); a category without a chart (`400 videoChartNotFound`) shows an empty list. Replaces the separate Music tab, user decision 2026-11-10)
- Tap a video = play now (queued items stay after it); **+** = add to the end of the queue; a playlist's Play all / tap = replace the queue with that playlist
- Not connected: the Link tab works; the other tabs show the Connect card with the privacy-policy link (§8.8)
- Header button **YouTube** opens https://www.youtube.com/ in a new tab (`rel="noopener"`, never `noreferrer`), for recommendations and anything else the API doesn't offer. youtube.com can't be embedded (`X-Frame-Options: SAMEORIGIN`)

## 9. Web app (open other websites)

### 9.1 UI

- URL bar (accepts bare domains), Home, Reload, "Open in new tab", view toggle **Auto / Mobile / Desktop** (§9.7)
- Bookmarks: `{id, title, url}` list, user-editable; any bookmark can be pinned to the App Picker as a one-tap app
- Recent URLs (last 10)
- Layout (M5): the controls live in the Web pane's header and the Web menu sheet (see "Changes during M5")
- No Back/Forward buttons: a parent page cannot read or drive a cross-origin iframe's history [Verify if a reliable alternative exists]

### 9.2 URL normalization

- Bare domain → prepend `https://`
- Reject anything that is not `http:` or `https:` (`javascript:`, `data:`, `file:` …)
- `http://` → try `https://` first; plain http inside an https app is blocked as mixed content → show "Open in new tab"

### 9.3 Frame check (before embedding)

`GET /api/frame-check?url=<encoded>` → server fetches the URL (GET, follow ≤ 5 redirects, 5 s timeout, read headers, abort the body) and returns `{status: 'allowed' | 'blocked' | 'unknown', finalUrl, reason}`:

- CSP `frame-ancestors` present → it decides: `'none'`, or a source list that does not match `APP_ORIGIN` (and contains no `*` / `https:`) → `blocked`; otherwise `allowed`
- No `frame-ancestors`, `X-Frame-Options: DENY` or `SAMEORIGIN` → `blocked`
- Neither header → `allowed`
- Fetch failed → `unknown` (try embedding anyway)

`blocked` → show a card in the pane: "This site doesn't allow being shown inside other apps" + "Open in new tab". Results cached per origin for 7 days in IndexedDB. This is a heuristic (headers can vary by user agent, cookies, or region), so "Open in new tab" stays available in the pane header for every site.

**SSRF protection (required):** only `http`/`https`; no credentials in the URL; resolve DNS (Workers have no DNS API: DNS-over-HTTPS, both A and AAAA; reject if any answer is non-public) and reject loopback, private, link-local, and cloud metadata ranges (IPv4 and IPv6), including after each redirect; ports 80/443 only; forward no cookies or auth headers; rate limit (e.g. 10/min per session).

### 9.4 Do not proxy

Do not fetch and re-serve third-party pages to strip framing headers. It breaks logins, creates security risks, and may violate the sites' terms.

### 9.5 iframe attributes [Proposal]

```html
<iframe
  src="..."
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
```

No geolocation, camera, or microphone permission delegated to embedded sites.

### 9.6 Logins inside the Web app

Signing in to a site inside the iframe depends on third-party cookies, same as §3.1 (likely works on Chrome, likely not on Safari) [Verify].

### 9.7 Mobile / Desktop view

**Constraint:** a browser's own "Request desktop site" works by changing the User-Agent. A web page cannot set the User-Agent for an iframe; the iframe always identifies as the real device [Secondary]. A true User-Agent switch is therefore impossible in this app, and it must not be faked via a proxy (§9.4).

**What the app does instead — viewport emulation:** responsive sites choose their layout from the width they are rendered at, and inside an iframe that width is the iframe's own width [Secondary; Verify on target devices]. So the app renders the iframe at a chosen *layout width* `L` and scales it to fit the pane:

```
s = paneWidth / L                      // scale factor
iframe.style.width     = L + 'px'
iframe.style.height    = (paneHeight / s) + 'px'
iframe.style.transform = `scale(${s})`
iframe.style.transformOrigin = '0 0'
wrapper: overflow hidden, size = pane
```

| Mode | Layout width `L` | Effect |
|---|---|---|
| Auto (default) | = pane width (`s = 1`) | Whatever the site picks for that width |
| Mobile | 400 px | Phone layout, scaled up to fill the pane (cap `s` at 2.0) — large text and buttons, good for driving |
| Desktop | 1280 px (setting: 1024 / 1280 / 1440) | Desktop layout, scaled down to fit — small text in a half-width pane; best used with full screen (§6.5) |

Plus zoom presets for Auto mode (75 / 100 / 125 / 150 %) using the same formula with `L = paneWidth / zoom`.

Details:
- Recompute on pane resize, swap, and full-screen changes (`ResizeObserver` on the wrapper). Resizing an iframe re-lays out the page without reloading it.
- Some sites decide their layout only at load time → after switching mode, show "Reload in this view" in the pane header.
- Touch input passes through the CSS transform to the right element [Verify on device]. Pinch-zoom inside a scaled iframe is not expected to work; use the zoom presets.
- Remember the choice per site origin (`web.viewModes[origin]`), and per bookmark (`bookmark.viewMode`).

**Limits (show as help text in the toggle):** sites that pick mobile vs desktop from the User-Agent or `Sec-CH-UA-Mobile` on the server — often those with a separate `m.` host — will not change. The user can edit the URL instead (e.g. `m.example.com` ↔ `www.example.com`). The app cannot detect which kind a site is (cross-origin), so the help text reads: "If the layout doesn't change, this site chooses it by device type."

---

## 10. Dashboard app (HUD) and alerts

### 10.1 Speed

- `navigator.geolocation.watchPosition({enableHighAccuracy: true, maximumAge: 1000})`
- `coords.speed` (m/s) × 3.6 → km/h; if `null`, compute haversine distance ÷ time between fixes, smoothed with a 3-point moving average
- GPS accuracy icon (3 levels); accuracy > 50 m → speed shown dimmed
- `font-variant-numeric: tabular-nums`

### 10.2 Dashboard content

Large speed, clock/date (`Intl.DateTimeFormat` in the UI language; option for Buddhist-era year in Thai), now-playing mini card, bookmark/playlist shortcuts, GPS accuracy.

### 10.3 Overspeed alert

- User sets `limitKmh`. **The default is only a starting value, not a legal limit**; the UI says "Set this to the posted limit on your route"
- Trigger: above `limitKmh + 2` for 3 s → alert once → wait `cooldownSec` (default 30) before repeating
- Visual (speed turns warning color) + voice
- v2 option: OpenStreetMap `maxspeed` via Overpass API — Thai coverage not checked; evaluate before building

### 10.4 Text-to-speech

- `speechSynthesis` with `lang` matching the UI (`th-TH` or `en-US`); pick a voice whose `lang` starts with the language code; user can choose the voice
- No matching voice → visual alert only + Settings note "No Thai voice on this device"
- Duck YouTube to 30% via `player.setVolume` while speaking, then restore
- Phrases: th "ความเร็วเกิน {limit} กิโลเมตรต่อชั่วโมง" · en "Over {limit} kilometers per hour"
- v2 option: Google Cloud Text-to-Speech via `/api/tts` (billed)

### 10.5 Keep screen on

Screen Wake Lock API (`navigator.wakeLock.request('screen')`), re-requested on every `visibilitychange` to visible [Verify on iOS].

---

## 11. Voice commands

- `SpeechRecognition || webkitSpeechRecognition`, `lang` = UI language, `interimResults: true`
- Large mic button in the Dock; if unsupported, hide it and show a text box (OS keyboard dictation still works)

| Thai | English | Action |
|---|---|---|
| "เปิดเพลง …" / "เล่น …" | "play …" | Library search (§8.4) → else `search.list` → play first result |
| "ถัดไป" / "ข้าม" | "next" / "skip" | Next track |
| "ก่อนหน้า" / "ย้อน" | "previous" / "back" | Previous track |
| "หยุด" / "พัก" | "pause" / "stop" | Pause |
| "เล่นต่อ" | "resume" | Play |
| "สลับจอ" | "swap" | Swap panes (or switch the full-screen app) |
| "เต็มจอ" | "full screen" | Focused pane full screen (in-app layer only) |
| "ออกจากเต็มจอ" | "exit full screen" | Exit full screen |
| "แผนที่" / "ยูทูบ" / "หน้าหลัก" | "map" / "youtube" / "dashboard" | Put that app in the focused pane |
| "นำทางไป …" | "navigate to …" | Navigation handoff (§7.3) |
| anything else | anything else | Treat as a YouTube search |

---

## 12. Visual design and UI copy

### 12.1 Screens

Landscape. Primary: the user's CarPlay screen size (to be measured with the M0 probe). Test at 800×480, 1024×600, 1280×720, 1920×720 (ultra-wide), and iPhone 16 Pro Max landscape (≈ 932×430, minimum height 430 with safe-area insets).

### 12.2 Principles

- Primary touch targets ≥ 64 px, secondary ≥ 48 px
- Readable at arm's length: speed ≥ 72 px, track title ≥ 22 px
- Motion only in response to touch; no looping animations; respect `prefers-reduced-motion`
- Avoid `backdrop-filter` blur / heavy glassmorphism (the original's style) and large box-shadows: many head units have weak GPUs. Use solid or slightly translucent surfaces [Proposal; not measured]
- Six theme presets (names may match the original) with original palettes — do not copy the original's visuals. Tokens per theme: `bg`, `surface`, `text`, `textDim`, `accent`, `warn`, `danger`. Every theme passes WCAG AA contrast.
- Night mode: automatic by time range (configurable); also drives the map `colorScheme`

### 12.3 Copy

- All strings live in `src/i18n/en.ts` (default) and `src/i18n/th.ts`; nothing hard-coded in components; missing Thai keys fall back to English
- Plain, specific wording: "Connect YouTube account" / "เชื่อมต่อบัญชี YouTube", "Connected: {email}" / "เชื่อมต่อแล้ว: {email}"
- Errors say what happened and what to do: "Location permission is off · Turn it on in browser settings to show speed"
- Empty states invite action: "Not connected yet · Connect to see your subscriptions and playlists, or paste a YouTube link to play now"

---

## 13. Settings (localStorage)

```ts
type AppRef =
  | { kind: 'dashboard' }
  | { kind: 'map' }
  | { kind: 'youtube' }
  | { kind: 'web'; url: string };

type WebViewMode =
  | { mode: 'auto'; zoom: 0.75 | 1 | 1.25 | 1.5 }
  | { mode: 'mobile' }
  | { mode: 'desktop' };

interface Settings {
  language: 'en' | 'th';            // default 'en'
  themeId: 'carbon' | 'racing' | 'neon' | 'emerald' | 'amber' | 'stealth';
  nightMode: { auto: boolean; start: string; end: string }; // "18:30", "06:00"
  layout: {
    mode: 'single' | 'split';
    splitRatio: number;             // 0.30–0.70
    panes: [AppRef, AppRef];        // pane 0 = left, pane 1 = right
    focusedPane: 0 | 1;
    fullscreenPane: 0 | 1 | null;   // §6.5
    driverSide: 'right' | 'left';   // default 'right'
  };
  map: {
    mode: 'js' | 'embed';
    follow: boolean;
    traffic: boolean;
    savedPlaces: { id: string; label: string; query: string }[];
    recentDestinations: string[];
  };
  web: {
    bookmarks: {
      id: string; title: string; url: string; pinned: boolean;
      viewMode?: WebViewMode;
    }[];
    recent: string[];
    viewModes: Record<string, WebViewMode>;   // key = origin, §9.7
    desktopWidth: 1024 | 1280 | 1440;          // default 1280
  };
  youtube: { miniPlayerSize: '356x200' | '480x270'; playbackRate: number }; // playbackRate default 1
  alerts: {
    overspeedEnabled: boolean;
    limitKmh: number;
    cooldownSec: number;
    ttsEnabled: boolean;
    ttsVoiceURI?: string;
  };
  library: { feedChannelLimit: number };
  voice: { enabled: boolean };
  clock: { buddhistYear: boolean };
  playbackLoginCheck?: { testedAt: string; sawAds: boolean; browser: string };
}
```

Settings has "Reset settings" and "Clear cached data".

## 14. PWA

- The app must work fully **without** a service worker or install: the CarPlay in-app browser likely has neither (§3.10). PWA install is a bonus for Safari/Chrome.
- Manifest: `name: "JorGu"`, `display: "fullscreen"` (fallback `standalone`), `orientation: "landscape"`, `lang: "en"`
- Service worker caches the app shell and fonts only; never `/api/*`, YouTube, Google Maps, or embedded sites
- Offline banner: "Offline · Video, maps, and websites need an internet connection"
- Update prompt: when a new service worker is waiting, show "New version available · Reload" (never auto-reload while YouTube is playing or the car is moving)

## 15. Security

- Example CSP (adjust to what actually loads; the Web app needs broad `frame-src`):
  - `frame-src https:` (Web app, YouTube player, Maps Embed)
  - `script-src 'self' https://www.youtube.com https://s.ytimg.com https://maps.googleapis.com`
  - `img-src 'self' data: blob: https://i.ytimg.com https://*.googleapis.com https://*.gstatic.com`
  - `connect-src 'self' https://maps.googleapis.com`
- Response header `Referrer-Policy: strict-origin-when-cross-origin` on all app pages (required for the YouTube player, §3.9); never `no-referrer`
- Maps API key: restrict to HTTP referrers (app domain + localhost) and to Maps JavaScript API + Maps Embed API only
- No analytics or tracking
- Rate-limit `/api/yt/search` (≥ 1 s apart) and `/api/frame-check` (§9.3)

---

## 16. Milestones and acceptance criteria

| # | Scope | Done when |
|---|---|---|
| M1 | Shell: pane system, Dock, single/split, swap (button + drag), per-pane full screen with floating controls, App Picker, themes, i18n en (default)/th, PWA — apps as placeholders | Swap and resize work; ⛶ enters full screen in one tap and ✕ / Back / Esc exit it; ⇄ switches the full-screen app; assignment persists across reload; driver side mirrors; works with no service worker; PWA installs in Chrome |
| M2 | YouTube player, paste link, queue, errors, media keys, mini player, §3.9 compliance **+ (merged from M3, 2026-11-09)** OAuth, privacy policy (§8.8), feed, subscriptions, playlists, liked, search + quota counter | All link forms play; auto-advance works; **swapping panes, toggling layout, or entering/exiting full screen does not interrupt playback**; mini player appears when YouTube plays off-pane; an automated check confirms no element overlaps the player rectangle at any time; Referer is sent; parser tests pass; connect/disconnect works; no tokens visible in DevTools; REAUTH banner works; library search runs before `search.list`; disconnect revokes the token and deletes cached account data |
| M3 | *Merged into M2 (user decision 2026-11-09).* | — |
| M4 | Google Maps mode A + navigation handoff + route overview (§7.4) + mode B fallback | One map instance across swaps; follow/recenter/traffic work; Navigate opens Google Maps with destination and draws the route overview (no turn instructions); mode B renders with no billing SKU used |
| M5 | Web app + frame-check + SSRF guard + Auto/Mobile/Desktop view | Allowed sites render; blocked sites show the card + new-tab button; a responsive test site switches layout between Mobile and Desktop without reload and stays tappable; view mode persists per origin; SSRF tests (localhost, 169.254.169.254, private IPs, redirect to private IP) are rejected |
| M6 | Dashboard HUD, overspeed alert + TTS, wake lock | With simulated location in DevTools, speed and alerts behave per §10 |
| M7 | Voice commands (th + en) | Commands in §11 work in Chrome; text fallback works where the API is missing |
| M8 | Real-device test pass | §17 completed and reported as a table |

## 17. Real-device test checklist

Primary column: **CarPlay browser app (CarTV / AP TV) on iPhone 16 Pro Max**. Add it as the first result column when filling this in; the others are secondary. Also check every §3.10 row.

| Item | Chrome Android / Android head unit | Safari iPhone (tab) | iPhone (Home Screen app) |
|---|---|---|---|
| Navigate → Google Maps guidance on CarPlay → return to JorGu → voice continues, route overview matches | | | |
| Signed-in playback (non-music video, no ad = pass) | | | |
| Playback continues through pane swap/full screen/mini player | | | |
| ⛶ hides browser UI (layer 2) | | n/a (iPhone) | n/a |
| Edge strip summons controls over Web without breaking scrolling | | | |
| Mini player appears whenever YouTube plays off-pane; nothing ever drawn over the player | | | |
| Web Desktop view: layout switches + taps land correctly | | | |
| Steering wheel / Bluetooth next/prev/play | | | |
| SpeechRecognition in th-TH and en-US | | | |
| Thai TTS voice available | | | |
| `coords.speed` non-null while driving | | | |
| Wake lock keeps screen on | | | |
| Navigate opens the Google Maps app | | | |
| Map loads per day stay within the cap (check console) | | | |
| Web app: 5 user-chosen sites — frame-check result vs actual | | | |

## 18. Google Cloud setup (user does this)

1. Create a Google Cloud project (one project for both YouTube and Maps)
2. Enable **YouTube Data API v3**, **Maps JavaScript API**, **Maps Embed API**, **Routes API** (§7.4)
3. OAuth consent screen (Google Auth Platform): External, Testing, add own Gmail as test user, add scopes from §8.1
4. Credentials → OAuth client ID → Web application → redirect URIs:
   - `https://<app-host>/api/auth/callback` (the `workers.dev` host or the custom domain, §18a)
   - `http://localhost:5173/api/auth/callback` (local dev: Vite + Cloudflare plugin)
5. Credentials → API key → restrict to HTTP referrers (app host + localhost) + the Maps APIs above → put in `VITE_GOOGLE_MAPS_API_KEY`
6. Google Maps Platform → Map management → create a Map ID (JavaScript, vector) → `VITE_GOOGLE_MAP_ID`
7. Billing: link a billing account [Verify requirement], set a budget alert, cap map loads (§7.1)
8. Worker secrets via `npx wrangler secret put <NAME>`; local secrets in `.dev.vars`; `VITE_*` values in `.env.local` locally and as Workers Builds build variables. `.dev.vars` and `.env.local` are git-ignored.

## 18a. Cloudflare + GitHub setup (user does this)

1. Cloudflare account (free plan). Pick the account's `workers.dev` subdomain → app URL `https://jorgu.<subdomain>.workers.dev`
2. Optional own domain: Workers Custom Domains require the domain's nameservers to be on Cloudflare (buy via Cloudflare Registrar, or move an existing domain's nameservers to Cloudflare). Add it in the Worker's Settings → Domains & Routes.
3. GitHub account + private repo `jorgu`; install GitHub CLI and run `gh auth login` on the dev machine
4. Cloudflare dashboard → Workers & Pages → Create → Import a repository → pick `jorgu` (Worker name must equal `name` in `wrangler.jsonc`). Production branch `main`.
5. Worker → Settings → Build → **Build command: `npm run build`** (Workers Builds ignores the custom-build setting in `wrangler.jsonc`). Deploy command stays `npx wrangler deploy`.

## 19. Open questions (user decides)

1. ~~Main device?~~ **Decided 2026-11-09:** iPhone 16 Pro Max via a CarPlay browser app (§3.10). Host app: **CarTV**. Still open: the car's CarPlay screen resolution (M0 probe measures it). Hosting: `https://jorgu.pv-proj.workers.dev` (free `workers.dev` name, no own domain for now).
2. Reconnect YouTube every 7 days (Testing), or try publishing unverified?
3. If on Premium Lite and mostly playing music: ads on music remain (§3.2)
4. ~~Enable billing for Maps JavaScript API (10,000 free loads/month), or use the free Embed mode only?~~ **Decided 2026-11-10:** mode A with billing, under the hard rule in §7.1 (never more than 9,500 billed events a month per SKU; past that, mode B).
5. Import Google Maps saved places from a Google Takeout export into JorGu's saved places? (Google has no API for them outside the EEA/CH/UK.)

## References

- YouTube Data API quota: https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube Data API revision history (watch history/later, Sept 2016): https://developers.google.com/youtube/v3/revision_history
- OAuth publishing status / 7-day expiry: https://support.google.com/cloud/answer/15549945
- Ads on embedded videos and cookies: https://support.google.com/youtube/answer/7437519
- Premium Lite: https://support.google.com/googleone/answer/17101453
- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Maps Embed API usage and billing: https://developers.google.com/maps/documentation/embed/usage-and-billing
- Maps URLs: https://developers.google.com/maps/documentation/urls
- Maps JavaScript API reference: https://developers.google.com/maps/documentation/javascript/reference
- YouTube Required Minimum Functionality: https://developers.google.com/youtube/terms/required-minimum-functionality
- YouTube IFrame API revision history: https://developers.google.com/youtube/iframe_api_revision_history
- MDN X-Frame-Options: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
- Original feature list (secondary): https://github.com/hituongvypham-hue/duo-screen-car
- Speech recognition support (secondary): https://caniuse.com/speech-recognition
- Fullscreen API support (secondary): https://caniuse.com/fullscreen
