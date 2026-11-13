# JorGu — Dual-Screen Car Dashboard · Build Spec for Claude Code

> Version 0.5 · 2026-11-09
> UX reference: https://duoscreen.vercel.app/ ("CarPlay Multi-Screen Dashboard")

### Changes during M4 (2026-11-11)

- **Loading:** Google's script URL (`maps.googleapis.com/maps/api/js?key=…&v=weekly&loading=async&callback=…&language=th|en&region=TH`), libraries via `google.maps.importLibrary` (maps, marker, routes, core). No npm loader package.
- **One map per page load** (each `new google.maps.Map` is a billed Dynamic Maps load). Its container is created once and never moved; in mode B it is hidden, not destroyed. `colorScheme` is set **at load only** (switching it later would need a new map, another load): Settings → Map colours, **Day** by default (user 2026-11-13: the day map reads better), or With night mode, or Night; a change applies at the next app load.
- **Cost rule (§7.1) in code (user 2026-11-13: unused days carry over):** a per-device counter per Pacific day and month for map loads (Dynamic Maps, cap 9,900), route lines (Compute Routes Essentials, 9,900) and traffic per section (Compute Routes Pro, 4,950): each 1 % under Google's free use per month. **Today's share = (cap − used before today) ÷ days left in the month, today included**, so a quiet day leaves more for the rest of the month. At a limit the app uses mode B / Embed directions / no traffic bar. Settings → Map shows each: left this month, today used / today's share. `gm_authFailure` (key refused: referrer, API off, billing off, quota) also switches to mode B until the next Pacific day. Settings → Map: **Interactive / Simple (free)** and this month's counts.
- **Traffic on by default** (user request 2026-11-11; the Traffic layer adds no SKU of its own). Embed itself has no traffic layer.
- **Controls** (56 / 64 / 72 px by Toolbar size, driver side): Where to? · Back to my location (follow; dragging the map pauses it) · Traffic · Zoom + / −, during a route Whole route · End · Google Maps (last: rarely used; user 2026-11-13), and the speed in km/h **beside the route box** (76 px wide, same height; in that corner when there's no route; above / below the box when there's no room beside; hidden while the route chooser is open and there's no room; user 2026-11-13, was a slot under the toolbar buttons that rarely had room). Mode B: Where to? and Recenter (reloads the Embed iframe). Placement (`mapChrome.ts`, unit-tested): a **strip flush to the driver-side edge** with the map beside it, never under it (user 2026-11-12); buttons in priority order (Where to?, ⌖, Traffic, + −, Whole route, End, Google Maps), what doesn't fit goes under **More** (a column over the map beside the strip); the buttons stop above a mini player on that edge (the strip moves to the other edge if the mini player covers nearly all of it); in map full screen the floating bar sits inside the strip (layout engine). The map container only changes size, never moves (§6.3). A hidden Map surface keeps the map hidden (`visibility: inherit`; user screenshot 2026-11-12 showed a line of map above the YouTube full-screen controls).
- **Where to?** sheet: destination text, saved places (add / remove), recent destinations (10). **Show route** (and tapping a saved or recent place) stays in JorGu and draws the route on the map; it never opens Google Maps (user request 2026-11-11: no jumping to Google Maps and back). **Navigate in Google Maps** (the route bar's ↗ button, and the current-route row in the sheet) is the only hand-off: a real link to `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=driving&dir_action=navigate` (`target=_blank`, `rel=noopener`) for voice guidance in the Google Maps app.
- **Route overview (§7.4):** one live map with the route line, a destination pin, the moving position and traffic together (user correction 2026-11-11: the earlier Embed-by-default view with a Traffic / Route switch was not what was agreed). Maps JS `Route.computeRoutes` with `routingPreference: TRAFFIC_UNAWARE` (Essentials SKU; traffic-aware is Pro) and `fields: durationMillis, distanceMeters, path`; the line comes from `createPolylines()`. Under the same cost rule as map loads: 320 route requests a day, 9,920 a month, per device. The map follows the car at zoom 16. **Navigation camera** (user request 2026-11-12): while following a drawn route the map turns so the road ahead points up (bearing from the car's spot on the line to 60 m ahead; else the GPS course when moving, else the last fixes) and the car sits 25 % of the map height below the middle, so more of the route ahead shows. `moveCamera` with an 800 ms glide. Vector maps only: if the map doesn't turn (raster, or rotation off for the Map ID) it stays north up and the car still sits back from the direction of travel [Verify on the iPhone]. Whole route → north up, fitted; ⌖ → back to the turned, following view; route ended → north up. The **route box** shows only time left, distance and arrival, in a corner on the other side from the toolbar, at the bottom (default) or top: tap it to switch, or Settings → Map. Its buttons moved into the **map toolbar** (user feedback 2026-11-12): Whole route, Google Maps (↗), End Distance and time left are worked out on the device from the position on the line. Recompute only when more than 200 m off the line, at most once a minute (no Refresh button). No position yet: the card waits and draws on the first fix. Kept in memory only. The free Embed `directions` view is used in mode B, when Settings → Map → route is set to the simple map, and as an automatic fallback with a note when the line can't be drawn (route limit reached, Routes API refused or failing).
- **Avoid tolls / Avoid highways** (Where to? sheet, remembered per device; user request 2026-11-11): Routes `routeModifiers.avoidTolls / avoidHighways`, not a Pro or Enterprise trigger in Google's Routes SKU list (checked 2026-11-11), so still Essentials [Verify the SKU in the Cloud billing report after use]. The Embed directions view gets `avoid=tolls|highways`. Changing them during a route draws it again. Maps URLs have no avoid parameter: the Google Maps app keeps its own route options (the sheet says so).
- **Route choices (user 2026-11-13):** "Show route" makes one Compute Routes **Pro** request (`TRAFFIC_AWARE`, `computeAlternativeRoutes: true`, fields `durationMillis, distanceMeters, path, description`), counted in the Pro share. Up to 3 routes, sorted fastest first by time in traffic (live test 2026-11-13: Victory Monument → Mega Bangna, the fastest in traffic was 30.3 km / 29 min, the shortest 25 km / 32 min; short trips get one route). With more than one, a chooser opens beside the route box (all routes on screen north up, the others grey): tap one to drive it, ✕ keeps the shown one, it closes by itself after 30 s; "Other routes" in the toolbar opens it again. The traffic request for the bar / colours is made for the picked route only. A recompute after leaving the route takes the fastest without asking. When the Pro share is used up or Google refuses it: one Essentials route (no traffic, no choices); past that, the free Embed view. Route box made bigger (248 × 84: time 28 px, distance · arrival 16 px, "via …" 13 px), still in its corner.
- **Route line and traffic (final, user 2026-11-13):** one solid blue line (7 px) with a dark edge (11 px, so it stands out from the Traffic layer on the same road); with Traffic on, its **slow stretches are painted orange and jammed ones red** (Google Maps style; blue elsewhere), from the same data as the bar, no extra request. Terms note: the Terms forbid using the Services "in a manner intended to avoid incurring Fees"; this uses a documented, billed Pro feature (per-leg traffic durations) as designed, but it resembles the Enterprise "traffic on polylines" result, so it's a grey area flagged to the user (2026-11-13). Traffic along the route is also a **bar beside the map's toolbar**: the whole route, start at the bottom and destination at the top, the car's blue dot climbing as you drive, the driven part dark grey, ahead green / orange / red per section (light grey where unknown), so a jam stays put on the bar while the dot moves towards it (user 2026-11-13; first version showed only the road ahead with the car fixed at the bottom). Source: one **Compute Routes Pro** request (`TRAFFIC_AWARE`, up to 25 intermediate waypoints placed on our own route with the road's heading, `fields: ['legs']`): each leg's `durationMillis ÷ staticDurationMillis` (< 1.3 green, < 2 orange, else red; a leg whose distance differs > 35 % from its section is unknown). Live-tested 2026-11-13 09:45 Bangkok: the route is unchanged by the waypoints (equal sections), Victory Monument → Siam showed 3–8× sections, the expressway ~1×. Fetched when a route is drawn, every 5 minutes while it's on, and when Traffic is switched back on after 5 minutes; skipped when Traffic is off or the page is hidden. The route box's time left uses it. Reading colours from the map was rejected (Terms §3.2.3(a) No Scraping, (c) No Creating Content From Google Maps Content). Earlier tries, replaced: with Traffic on, the route was two solid blue edges 9 px either side of it (redrawn for each zoom, so the spacing is the same on screen at any zoom; tight-bend knots on the inside edge are cut out), and the Traffic layer's red / orange / green on the road shows between them; with Traffic off it is one solid line. History (user 2026-11-12): a 50 % see-through line was too faint; a chain of arrows was too busy; the user picked the two edges (option A). [Verify] on iPhone in the car. A line coloured by traffic (`extraComputations: TRAFFIC_ON_POLYLINE`, "Traffic information on polylines") is the **Enterprise** route SKU, 1,000 free a month (about 32 a day): not used. `TRAFFIC_AWARE` routing (route and ETA that consider traffic) is **Pro**, 5,000 free a month (cap would be 160/day): not used unless the user chooses it.
- **Toolbar size** (Settings, was Dock only) also sizes the full-screen floating bar and YouTube full-screen column (64 / 76 / 88 px buttons, 72 / 84 / 96 px column), the transport row under the clip title (48 / 56 / 64 px, title + row 88 / 96 / 104 px) and the map buttons (user 2026-11-12). The stacked YouTube pane minimum grows with it (56 + 201 + row height) so the player stays ≥ 356×200; layout invariant tests run at every size.
- **YouTube pane controls** (user 2026-11-12/13): a strip on the driver-side edge of the pane (button size by Toolbar size), or 1–2 rows under the player (2 when one row can't hold all nine): whichever gives the bigger player, the strip when the rows would not make it at least 10 % bigger (in two panes the rows usually win: the player keeps the pane's full width). The player is never under 356×200. The row's buttons fill the pane's width (user 2026-11-13, car photo): they grow, up to 1.75× and only into the height left under the player (the player keeps its size), or shrink to stay on one line (down to 36 px wide) before it wraps to two. Player and controls are centred up and down in the pane (user 2026-11-13). Buttons that don't fit the strip stay in the queue sheet (no menu over the player). The clip title, "Tap to start" and "Play next" are in the pane header, which stays shown for YouTube (2 lines, plain text so the header still drags). The YouTube pane's minimum width/height follow from this (`ytPaneMinWidth` / `ytPaneMinHeight`); layout invariants check the controls never touch the player.
- **Build stamp** in Settings: version · commit (`WORKERS_CI_COMMIT_SHA` in Workers Builds) · build time (Bangkok), to tell an old cached copy on the phone from the live one.
- **No key in the build:** the Map pane says "Google Maps isn't set up yet"; Navigate still works (Maps URLs need no key).
- **CSP** widened per Google's Maps JavaScript API CSP guide (allowlist variant): `script-src` adds `'unsafe-eval'`, `blob:`, `*.googleapis.com`, `*.gstatic.com`, `*.google.com`; `connect-src` the same plus `data:` `blob:`; `worker-src blob:`; fonts from `fonts.googleapis.com` / `fonts.gstatic.com`. [Verify with the real key that nothing is blocked.]
- E2E tests serve a stub for the Maps script and the Embed page (fake key `e2e-fake-key`), so tests never load real maps or spend billed events.

### Changes after M5: user feedback (2026-11-11)

- **Mini player** sits in the **bottom corner on the driver side** by default (was the passenger side). The user can move it: drag the grip on its handle to a corner (it snaps there), tap the grip to step clockwise, or pick Auto / a corner in Settings. Sheets and the full-screen floating bar move to the other side; the edge strip and divider stop short of it (§6.6).
- **YouTube controls:** back / forward 10 s and mute (iPhone ignores volume levels; mute works). On narrow panes the transport row drops speed first, then mute; all four are always in the queue sheet, the mini handle (speed, mute) and full screen. In YouTube full screen the control column doubles when the 16:9 player is limited by the other dimension anyway.
- **Keep playing the list** (Settings, on by default): a tap in New, Trending, Search or Recently plays that video, then the rest of that list (up to 50), after any videos added with +. A tap in another list replaces that part. Playlists already play through. A pasted link has nothing to continue (`search.list relatedToVideoId` was removed in Aug 2023).
- **Recently** tab in the library: videos played in JorGu on this device, newest first, max 100, kept 30 days (Developer Policies III.E.4); no account needed.
- **Shorts hidden** on New and Trending. The Data API has no Shorts flag, so: length ≤ 60 s, or ≤ 3 min with `#shorts` in title, description or tags; live streams (0 s) stay. Not applied to Search (III.C.5: don't modify search results) or to the user's own playlists. Trending asks for `contentDetails` in the same call; New adds `videos.list` (≤ 2 units).
- **Toolbar (Dock) size** in Settings: Normal / Large / Extra large (72 / 80 / 88 px: as wide as the map / YouTube / Web strips; user 2026-11-13, was 80 / 96 / 112).
- **Web:** pin a Recent page to the App Picker in one tap; "Add a site" bookmarks any address without opening it.
- **Not possible:** background playback (Developer Policies III.I.9); a caption on/off button (the IFrame API documents only `cc_load_policy` / `cc_lang_pref` at load; use the player's own CC button, iOS Settings → Accessibility → Subtitles & Captioning, or YouTube's "Always show captions"); signing in to sites inside a Web pane on CarTV (tested by the user 2026-11-11: fails; the WebView blocks the embedded site's cookies, §9.6).
- **YouTube + a video in the Web pane at once:** allowed (it's one YouTube player). Whether iOS keeps both playing is [Verify]; YouTube's mute button lets the other one have the sound.

### Changes during M5 (2026-11-10)

- **M6 (Dashboard HUD, overspeed alert, TTS, wake lock) and M7 (voice commands) are cut** (user decision 2026-11-10: not used). §10 and §11 stay for reference only; their rows in §16 and §17 are dropped.
- With M6 gone, the **Dashboard app and the Dock's Home button are removed** (2026-11-11). Apps are Map, YouTube, Web. A saved Dashboard pane becomes Map (or YouTube when Map is in the other pane). Settings `alerts`, `voice`, `clock` are dropped. The speed readout on the map stays in M4.

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
- Checked against current docs: Google Maps Platform Terms (last modified 2026-08-26) §3.2.3(d)(ii) "create a substitute of … Google Maps mobile apps, or their features" and (d)(iv) "combine data from the Directions API, Geolocation API, and Maps SDK for Android to create real-time navigation functionality substantially similar to" Google Maps for Android; no personal-use exemption. Re-read 2026-11-12: a heading-up camera is a map display, not guidance, so it is built; turn-by-turn instructions and voice stay out. **Open risk:** §3.2.3(f) "No Use in Embedded Vehicle Systems … will not use the Google Maps Core Services in connection with any Customer Application or device embedded in a vehicle" (example: an in-dashboard infotainment app that requests driving directions). JorGu runs on the phone and CarTV shows it on the CarPlay screen, which is a grey area under (f); raised with the user 2026-11-12. Navigation SDK has no web version. `google.com/maps` sends `X-Frame-Options: SAMEORIGIN` (tested 2026-11-09), so it can't be embedded.
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

*Not used: voice commands (M7) were cut on 2026-11-10.*

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
- **App**: `map`, `youtube`, `web` (each web instance carries its own URL). The Dashboard app was removed with M6 (2026-11-11).
- **Assignment**: which app is in which pane, persisted

Rules:
- `map` and `youtube` are singletons (one instance each — one map load, one audio source). Assigning a singleton that is already visible in the other pane performs a swap.
- `web`: at most one instance per pane, each with its own URL.
- Apps not currently visible stay mounted. Exception: while YouTube is playing it is never hidden — it becomes the mini player (§6.6).
- A pane holding YouTube is never narrower than 356 px; the divider stops there (§3.9). On screens too small for that in `split`, YouTube can only be in `single` or the mini player.

### 6.2 Interactions

| Action | Result |
|---|---|
| Tap pane header "Change" | App Picker sheet: Map, YouTube, Web, plus pinned bookmarks as one-tap entries |
| Tap ⇄ in Dock | Swap the two panes' contents |
| Drag one pane header onto the other pane | Swap |
| Tap ⛶ on a pane (or double-tap its header) | That pane goes full screen (§6.5) |
| Tap layout button in Dock | Toggle `single` ↔ `split` |
| Drag divider | Resize; snap points at 40/50/60% |

Pane headers are slim (≤ 40 px) and auto-hide after 4 s of no touch; tap the pane edge to reveal [Proposal]. The ⛶ button is the exception: it stays visible as a translucent 48 px button in the pane's top corner nearest the driver, so full screen is always one tap away.

### 6.3 Implementation rule (critical)

Removing an iframe from the DOM and inserting it elsewhere reloads it, which would stop YouTube playback and reset web pages. Therefore:
- Render each app surface **once**, inside a single fixed container.
- Position surfaces with CSS (`grid-area` or absolute positioning computed from the assignment). **Never re-parent iframes or the map container.**
- Hidden surfaces (Map, Web): `visibility: hidden` + `pointer-events: none`, kept mounted. The YouTube surface is never hidden or covered while playing; it is repositioned as the mini player instead (§6.6). If YouTube is paused and not assigned to a visible pane, it may be hidden.
- Stacking order: the YouTube surface is always the top layer among app surfaces, and no app UI (headers, floating bars, toasts, sheets) may be placed over its rectangle. Sheets and toasts position themselves around it.
- After a resize or swap, re-center the map once the transition ends [Verify whether the Maps JS API handles container resize automatically].

### 6.4 Defaults

`split`, 50/50 · left pane: YouTube · right pane: Map (driver side) · Dock on the right edge. Setting `driverSide: 'left'` mirrors everything.

```
split (default, driverSide = right)
┌─────────────────────────────┬─────────────────────────────┬────┐
│ ▸ YouTube     [Change]  ⛶   │ ▸ Map         [Change]  ⛶   │ ⇄  │
│ ┌─────────────────────────┐ │                             │ ◫  │
│ │ video / artwork          │ │          ● you              │ ⚙  │
│ └─────────────────────────┘ │                             │    │
│ Song title · Channel        │                 ┌────────┐  │    │
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

**While full screen — floating controls:** a tap on the edge strip (or a tap when the surface is the Map) shows, for 4 s, a floating bar on the driver side with large (≥ 64 px) buttons:
- **Exit full screen** (✕)
- **⇄ Switch** — puts the *other* pane's app full screen instead (fast Map ↔ YouTube flip while staying full screen)
- **App picker** — choose which app is full screen
- YouTube controls (⏮ ⏯ ⏭) when YouTube is not the full-screen app

Edge strip: on Web surfaces, taps go to the iframe, so a transparent ≈ 24 px strip along the driver-side edge sits above the iframe to summon controls [Proposal; Verify it doesn't block site scrollbars].

**YouTube full screen is laid out differently** (§3.9 forbids anything in front of the player): the player gets the screen minus a permanent control column (≈ 72 px) on the driver side. The edge strip and floating buttons live in that column, beside the player, never on top of it. The player stays 16:9-letterboxed inside its rectangle.

### 6.6 YouTube mini player

When YouTube is playing but not assigned to a visible pane (another app is full screen, or `single` layout shows another app):
- The YouTube surface is repositioned (CSS only, §6.3) to the **bottom corner on the driver side** by default (user request 2026-11-11; was the passenger side), size 356×200 (16:9); user can pick 356×200 / 480×270 and the corner in Settings, or drag / tap the grip on the mini handle
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
- **Cost rule (user decisions 2026-11-10 and 2026-11-11, binding): JorGu must never cost money.** At most **320 billed events a day per billed SKU** (320 x 31 = 9,920 a month, under the 10,000 free; first decided as 9,500/month, changed 2026-11-11). Originally: never more than 9,500 billed events per calendar month for each billed SKU (Dynamic Maps for map loads; Routes "Compute Routes Essentials" for the route overview), below the 10,000 free. When the next event would pass the cap, or Google refuses a load for quota, the app switches to **mode B** (Embed, no charge) until the month resets; the route overview falls back to the Embed directions view.
  - Hard guard (can't be bypassed by a bug or a second device): in Cloud Console, cap each billed API at **320 requests/day** (320 × 31 = 9,920; 330 would allow 10,230) [Verify the quota names and that a per-day cap exists for the Routes API; if it doesn't, the app counter is the guard and the cap goes per minute].
  - App counter: counts its own map loads and route requests per month and per day (Pacific time, like Google's billing and quota reset) in localStorage and switches to mode B at 9,920 a month or 320 a day. Per device only, which is why the hard guard exists. Settings → Map shows what's left (month) and used (today) for each.
  - **Never costs money (user 2026-11-11):** the Routes API line counts against its own 320/day app cap, like map loads (free tier 10,000/month; the trial can't charge). It is on by default since 2026-11-11 (user correction); Settings can switch the route to the free Embed view. Google's caps are per day only (no monthly cap), so the Cloud Console cap must stay at 320/day (max safe 322): a higher daily cap (e.g. 330 or 500) could pass 10,000 in a 31-day month.
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
| `GET /api/yt/feed` | `channels.list part=contentDetails` (50 ids/call) → `playlistItems.list` on each uploads playlist, 5 items each → `videos.list part=snippet,contentDetails` on the newest 100 to hide Shorts | ≈ ⌈n/50⌉ + n + 2 | 30 min |
| `GET /api/yt/playlists` | `playlists.list mine=true` | 1/page | 1 h |
| `GET /api/yt/playlist-items?id=` | `playlistItems.list` | 1/page | 1 h |
| `GET /api/yt/liked` | `videos.list myRating=like` | 1/page | 1 h |
| `GET /api/yt/search?q=` | `search.list type=video regionCode=TH relevanceLanguage=<ui lang> maxResults=20` | 1 search call | 24 h per query |
| `GET /api/yt/popular?category=` | `videos.list part=snippet,contentDetails chart=mostPopular regionCode=TH [videoCategoryId]` (Shorts hidden) | 1 | 1 h |
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

- The transport row's **Library** button opens a sheet (placed by the layout engine, never over the player) with tabs in this order (user decision 2026-11-11): **New** (feed) · **Playlists** (→ items, Play all) · **Trending** (below) · **Recently** (played in JorGu on this device) · **Search** (§8.4; liked videos are searched too, but have no tab of their own: user decision 2026-11-10) · **Link** (paste, §8.3). First open: New when connected, else Link. Trending details: (`chart=mostPopular`, region TH, with category chips from `videoCategories.list regionCode=TH hl=<ui lang>` (assignable only, Music first); a category without a chart (`400 videoChartNotFound`) shows an empty list. Replaces the separate Music tab, user decision 2026-11-10)
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

Signing in to a site inside the iframe depends on third-party cookies, same as §3.1 (likely works on Chrome, likely not on Safari). **Tested on CarTV (2026-11-11): fails** — the site forgets the login. Use Open in new tab. JorGu can't fix this without a proxy (§9.4).

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

**Web toolbar** (user 2026-11-13): while a site is shown, the Web pane has its own strip on the driver-side edge like the map's (same placement rules: clear of the mini player and the full-screen bar, More for overflow): **🔍** first (opens the Web menu: search or change site, so the header at the top isn't needed); in full screen **✕ Exit full screen** next (a site takes every tap, so the way out is in our strip; user 2026-11-13); then Back / Forward, **Mobile** and **Desktop** (lit when on; tap again for Auto), **Zoom +**, the current **%** (tap: Auto 100 %), **Zoom −**. Zoom steps 50 / 67 / 75 / 90 / 100 / 110 / 125 / 150 / 175 / 200 %, from what's on screen now (in Mobile or Desktop a zoom step goes back to Auto). In Web full screen the reveal edge strip sits just inside this toolbar. A view choice applies to the whole site: its origin and all its bookmarks (user 2026-11-13: a bookmark's older choice used to win, so zoom seemed not to stick).

**Back / Forward** (user 2026-11-13, first two buttons of the Web toolbar). A page can't read or drive a cross-origin iframe's history, but the browser keeps one joint history for the page and its frames, so `history.back()` / `forward()` from JorGu step the frame that navigated last. `webHistory.ts` counts each frame's steps from its load events (a load JorGu didn't cause = a new page); JorGu's own frame changes (Reload, the map's Embed view) use `location.replace()` and add no step; the buttons are enabled only for the frame whose step is on top, so they never move another frame. A guard history entry, pushed when a Web page first shows, catches a miscounted Back (a site that replaces its own page) so it never leaves JorGu. In-page steps of single-page sites fire no load and aren't counted (Back may stay off there). [Verify] in the CarTV browser on iPhone.

Details:
- Recompute on pane resize, swap, and full-screen changes (`ResizeObserver` on the wrapper). Resizing an iframe re-lays out the page without reloading it.
- Some sites decide their layout only at load time → after switching mode, show "Reload in this view" in the pane header.
- Touch input passes through the CSS transform to the right element [Verify on device]. Pinch-zoom inside a scaled iframe is not expected to work; use the zoom presets.
- Remember the choice per site origin (`web.viewModes[origin]`), and per bookmark (`bookmark.viewMode`).

**Limits (show as help text in the toggle):** sites that pick mobile vs desktop from the User-Agent or `Sec-CH-UA-Mobile` on the server — often those with a separate `m.` host — will not change. The user can edit the URL instead (e.g. `m.example.com` ↔ `www.example.com`). The app cannot detect which kind a site is (cross-origin), so the help text reads: "If the layout doesn't change, this site chooses it by device type."

---

## 10. Dashboard app (HUD) and alerts

> **Cut (user decision 2026-11-10): not built.** Kept for reference only.

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

> **Cut (user decision 2026-11-10): not built.** Kept for reference only.

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
  library: { feedChannelLimit: number };
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
| M6 | *Cut (user decision 2026-11-10): not used.* | — |
| M7 | *Cut (user decision 2026-11-10): not used.* | — |
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
| `coords.speed` non-null while driving | | | |
| Navigate opens the Google Maps app | | | |
| Map loads per day stay within the cap (check console) | | | |
| Web app: 5 user-chosen sites — frame-check result vs actual | | | |

## 18. Google Cloud setup (user does this)

Maps part step by step, in Thai: `docs/setup-google-maps-th.md` (quota cap first, key last).

1. Create a Google Cloud project (one project for both YouTube and Maps)
2. Enable **YouTube Data API v3**, **Maps JavaScript API**, **Maps Embed API**, **Routes API** (§7.4: the Maps JS `Route` class uses it [Verify])
3. OAuth consent screen (Google Auth Platform): External, Testing, add own Gmail as test user, add scopes from §8.1
4. Credentials → OAuth client ID → Web application → redirect URIs:
   - `https://<app-host>/api/auth/callback` (the `workers.dev` host or the custom domain, §18a)
   - `http://localhost:5173/api/auth/callback` (local dev: Vite + Cloudflare plugin)
5. Credentials → API key → restrict to websites (`https://jorgu.pv-proj.workers.dev/*`, `http://localhost:5173/*`; not 4173: preview/E2E use a fake key) and to Maps JavaScript API + Maps Embed API + Routes API → put in `VITE_GOOGLE_MAPS_API_KEY` (a Workers Builds **build variable**: it ends up in the page, which is normal for a browser key; the referrer restriction protects it)
6. Google Maps Platform → Map management → create a Map ID (JavaScript, vector) → `VITE_GOOGLE_MAP_ID`
7. Billing: link a billing account [Verify requirement], set a budget alert (USD 1), cap each billed API at 320 requests/day in Quotas (§7.1 cost rule)
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
4. ~~Enable billing for Maps JavaScript API (10,000 free loads/month), or use the free Embed mode only?~~ **Decided 2026-11-10:** mode A with billing, under the hard rule in §7.1 (now 320 billed events a day per SKU = at most 9,920 a month; past that, mode B).
5. Import Google Maps saved places from a Google Takeout export into JorGu's saved places? (Google has no API for them outside the EEA/CH/UK.) Asked again 2026-11-11 ("log in to Google to see saved places?"): Google sign-in can't read them; the Data Portability API (`dataportability.maps.starred_places`, `dataportability.saved.collections`) only serves accounts in the EU/EEA, Switzerland and the UK.
6. **Parked (user, 2026-11-10):** a "Later" list inside JorGu (stored on the device; save from library, search, Trending), because the Data API returns Watch Later empty since 2016 (§3.3). Until then: save videos to an own YouTube playlist, which shows in the Playlists tab.
7. **Parked:** discovery beyond subscriptions ("saved topics" / "creator picks"); only if asked.

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
