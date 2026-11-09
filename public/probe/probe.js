// JorGu M0 capability probe. Checks what the host browser (CarTV in-app browser, Safari, …) supports.
// Results persist in localStorage so link tests survive leaving and returning to the page.
'use strict';

const STORE_KEY = 'jorgu.probe.results';
const PENDING_KEY = 'jorgu.probe.pendingLink';
const LAUNCH_KEY = 'jorgu.probe.launches';

const results = loadJSON(STORE_KEY, {});
const $ = (id) => document.getElementById(id);

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

function set(key, status, value) {
  results[key] = { status, value: String(value), at: new Date().toISOString() };
  saveJSON(STORE_KEY, results);
  render();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`no response within ${ms / 1000} s`)), ms)),
  ]);
}

function log(msg) {
  const line = `${new Date().toLocaleTimeString()}  ${msg}\n`;
  $('log').textContent = line + $('log').textContent;
}

function render() {
  const rows = $('rows');
  rows.textContent = '';
  for (const key of Object.keys(results).sort()) {
    const { status, value } = results[key];
    const tr = document.createElement('tr');
    const k = document.createElement('td');
    const v = document.createElement('td');
    k.textContent = key;
    v.textContent = value;
    v.className = status;
    tr.append(k, v);
    rows.append(tr);
  }
  $('report').value = JSON.stringify({
    probe: 'jorgu-m0', version: 1, ts: new Date().toISOString(), url: location.href, results,
  }, null, 2);
}

// ---------- environment ----------
function checkEnvironment() {
  const ua = navigator.userAgent;
  set('env.userAgent', 'info', ua);
  let kind = 'other';
  if (/iPhone|iPad|iPod/.test(ua)) {
    if (/CriOS/.test(ua)) kind = 'Chrome on iOS';
    else if (/FxiOS/.test(ua)) kind = 'Firefox on iOS';
    else if (/Safari\//.test(ua)) kind = 'Safari (or SFSafariViewController)';
    else kind = 'in-app WKWebView (likely CarTV browser)';
  } else if (/Android/.test(ua)) kind = 'Android browser';
  else kind = 'desktop browser';
  set('env.browserGuess', 'info', kind);
  const modes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
  const mode = modes.find((m) => matchMedia(`(display-mode: ${m})`).matches) ?? 'unknown';
  set('env.displayMode', 'info', mode + (navigator.standalone ? ' (navigator.standalone)' : ''));
  set('env.online', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? 'online' : 'offline');
  set('env.secureContext', isSecureContext ? 'ok' : 'fail', isSecureContext ? 'yes' : 'no (GPS etc. need HTTPS)');
}

function checkViewport() {
  const sa = getComputedStyle($('safe-area-probe'));
  const inset = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(sa['padding' + s]) || 0);
  const vv = window.visualViewport;
  const orient = screen.orientation?.type ?? (matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
  set('viewport.inner', 'info', `${innerWidth}×${innerHeight} CSS px, dpr ${devicePixelRatio}`);
  set('viewport.visual', 'info', vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} scale ${vv.scale}` : 'n/a');
  set('viewport.screen', 'info', `${screen.width}×${screen.height}`);
  set('viewport.orientation', 'info', orient);
  set('viewport.safeAreaInsets', 'info', `top ${inset[0]} right ${inset[1]} bottom ${inset[2]} left ${inset[3]}`);
  const usableW = innerWidth - inset[1] - inset[3];
  const half = Math.floor((usableW - 80) / 2);
  set('viewport.splitPaneWidth', half >= 356 ? 'ok' : 'warn',
    `≈${half}px per pane at 50/50 with an 80px dock (YouTube needs ≥356)`);
}

// ---------- storage ----------
async function checkStorage() {
  try {
    const n = (parseInt(localStorage.getItem(LAUNCH_KEY) ?? '0', 10) || 0) + 1;
    localStorage.setItem(LAUNCH_KEY, String(n));
    set('storage.localStorage', 'ok', `works · page loads counted: ${n} (reopen the app later: number should keep rising)`);
  } catch (e) {
    set('storage.localStorage', 'fail', e.name + ': ' + e.message);
  }
  try {
    document.cookie = 'jg_probe=1; Max-Age=600; Path=/; Secure; SameSite=Lax';
    set('storage.firstPartyCookie', document.cookie.includes('jg_probe=1') ? 'ok' : 'fail',
      document.cookie.includes('jg_probe=1') ? 'set and read back' : 'could not read back');
  } catch (e) {
    set('storage.firstPartyCookie', 'fail', e.message);
  }
  set('storage.storageAccessAPI', 'info', typeof document.hasStorageAccess === 'function' ? 'present' : 'absent');
  try {
    await withTimeout(new Promise((resolve, reject) => {
      const req = indexedDB.open('jorgu-probe', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(Date.now(), 'last');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), 5000);
    set('storage.indexedDB', 'ok', 'open + write works');
  } catch (e) {
    set('storage.indexedDB', 'fail', String(e));
  }
}

async function checkServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    set('pwa.serviceWorker', 'warn', 'not available (app must work without it)');
    return;
  }
  try {
    const reg = await withTimeout(navigator.serviceWorker.register('/probe/sw.js', { scope: '/probe/' }), 8000);
    const sw = reg.installing || reg.waiting || reg.active;
    set('pwa.serviceWorker', 'ok', `registered (${sw ? sw.state : 'unknown state'})`);
  } catch (e) {
    set('pwa.serviceWorker', 'fail', `register failed: ${e.name}: ${e.message}`);
  }
}

// ---------- headers ----------
async function checkHeaders() {
  try {
    const res = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
    const rp = res.headers.get('referrer-policy');
    set('headers.referrerPolicy', rp === 'strict-origin-when-cross-origin' ? 'ok' : 'warn', rp ?? '(header not visible)');
  } catch (e) {
    set('headers.referrerPolicy', 'warn', 'fetch failed: ' + e.message);
  }
}

// ---------- feature presence ----------
function checkPresence() {
  const fsEnabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  set('api.fullscreen', fsEnabled ? 'ok' : 'warn', fsEnabled ? 'element full screen enabled' : 'not enabled (in-app full screen only)');
  set('api.wakeLock', 'wakeLock' in navigator ? 'ok' : 'warn', 'wakeLock' in navigator ? 'present (tap to test)' : 'absent');
  set('api.mediaSession', 'mediaSession' in navigator ? 'ok' : 'warn', 'mediaSession' in navigator ? 'present' : 'absent');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  set('api.speechRecognition', SR ? 'ok' : 'warn', SR ? 'present (tap to test)' : 'absent (text input fallback)');
  set('api.geolocation', 'geolocation' in navigator ? 'ok' : 'fail', 'geolocation' in navigator ? 'present (tap Start GPS)' : 'absent');
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' })
      .then((p) => set('api.geolocationPermission', 'info', p.state))
      .catch(() => set('api.geolocationPermission', 'info', 'query not supported'));
  }
}

// ---------- text to speech ----------
function voices() {
  return 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
}
function checkVoices() {
  if (!('speechSynthesis' in window)) {
    set('tts.speechSynthesis', 'fail', 'absent');
    return;
  }
  const report = () => {
    const all = voices();
    const th = all.filter((v) => v.lang.toLowerCase().startsWith('th'));
    set('tts.voices', all.length ? 'ok' : 'warn', `${all.length} voices`);
    set('tts.thaiVoices', th.length ? 'ok' : 'warn', th.length ? th.map((v) => `${v.name} (${v.lang})`).join(', ') : 'none found');
  };
  report();
  speechSynthesis.addEventListener?.('voiceschanged', report);
  setTimeout(report, 1500);
}
function speak(lang, text, key) {
  if (!('speechSynthesis' in window)) return set(key, 'fail', 'speechSynthesis absent');
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = voices().find((x) => x.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (v) u.voice = v;
  u.onstart = () => set(key, 'ok', `speaking with ${v ? v.name : 'default voice'}`);
  u.onend = () => set(key, 'ok', `finished (${v ? v.name : 'default voice'}) — did you hear it?`);
  u.onerror = (e) => set(key, 'fail', 'error: ' + e.error);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  set(key, 'info', 'queued…');
}

// ---------- speech recognition ----------
function listen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return set('voice.recognitionTest', 'warn', 'API absent');
  const r = new SR();
  r.lang = 'th-TH';
  r.interimResults = true;
  r.onstart = () => set('voice.recognitionTest', 'info', 'listening… say "ถัดไป"');
  r.onresult = (e) => {
    const text = Array.from(e.results).map((x) => x[0].transcript).join(' ');
    set('voice.recognitionTest', 'ok', 'heard: ' + text);
  };
  r.onerror = (e) => set('voice.recognitionTest', 'fail', 'error: ' + e.error);
  try { r.start(); } catch (e) { set('voice.recognitionTest', 'fail', e.message); }
}

// ---------- geolocation ----------
let geoWatch = null;
let fixes = 0;
let speedFixes = 0;
function startGeo() {
  if (!('geolocation' in navigator)) return set('geo.status', 'fail', 'geolocation absent');
  if (geoWatch !== null) return;
  set('geo.status', 'info', 'waiting for permission / first fix…');
  geoWatch = navigator.geolocation.watchPosition((pos) => {
    fixes += 1;
    const c = pos.coords;
    if (c.speed !== null && !Number.isNaN(c.speed)) speedFixes += 1;
    set('geo.status', 'ok', `${fixes} fixes`);
    // Rounded to ~1 km so the copied report doesn't reveal an exact location.
    set('geo.position', 'info', `${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)} (rounded) · accuracy ${Math.round(c.accuracy)} m`);
    set('geo.speed', c.speed === null ? 'warn' : 'ok',
      c.speed === null ? `null (${speedFixes}/${fixes} fixes had speed)` : `${(c.speed * 3.6).toFixed(1)} km/h (${speedFixes}/${fixes} fixes had speed)`);
    set('geo.heading', 'info', c.heading === null ? 'null' : `${Math.round(c.heading)}°`);
  }, (err) => {
    const names = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };
    set('geo.status', 'fail', `${names[err.code] ?? err.code}: ${err.message}`);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}

// ---------- wake lock / full screen ----------
async function wakeLock() {
  if (!('wakeLock' in navigator)) return set('api.wakeLockTest', 'warn', 'absent');
  try {
    const lock = await navigator.wakeLock.request('screen');
    set('api.wakeLockTest', 'ok', 'acquired');
    lock.addEventListener('release', () => log('wake lock released'));
  } catch (e) {
    set('api.wakeLockTest', 'fail', `${e.name}: ${e.message}`);
  }
}
async function toggleFullscreen() {
  const el = document.documentElement;
  const current = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (current) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) return set('api.fullscreenTest', 'warn', 'requestFullscreen absent');
      await req.call(el);
    }
  } catch (e) {
    set('api.fullscreenTest', 'fail', `${e.name}: ${e.message}`);
    return;
  }
  setTimeout(() => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    set('api.fullscreenTest', on ? 'ok' : 'warn', on ? 'entered full screen' : 'not in full screen');
  }, 600);
}

// ---------- YouTube ----------
let ytPlayer = null;
const YT_STATES = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
function ytStateName() {
  try { return ytPlayer ? (YT_STATES[ytPlayer.getPlayerState()] ?? '?') : 'no player'; } catch { return '?'; }
}
function loadYouTube() {
  if (ytPlayer || document.getElementById('yt-api')) return;
  set('yt.api', 'info', 'loading iframe_api…');
  window.onYouTubeIframeAPIReady = () => {
    set('yt.api', 'ok', 'iframe_api loaded');
    ytPlayer = new YT.Player('yt-player', {
      width: 356,
      height: 200,
      // Official IFrame API sample video from Google's documentation.
      videoId: 'M7lc1UVf-VE',
      host: 'https://www.youtube.com',
      playerVars: { playsinline: 1, rel: 0, enablejsapi: 1, origin: location.origin },
      events: {
        onReady: () => set('yt.player', 'ok', 'ready — tap Play'),
        onStateChange: (e) => {
          const name = YT_STATES[e.data] ?? e.data;
          set('yt.state', e.data === 1 ? 'ok' : 'info', name);
          log('YouTube state: ' + name);
        },
        onError: (e) => {
          const hint = { 2: 'bad parameter', 5: 'HTML5 error', 100: 'not found/private', 101: 'embedding disabled', 150: 'embedding disabled', 153: 'missing Referer (Referrer-Policy problem)' };
          set('yt.error', 'fail', `${e.data} ${hint[e.data] ?? ''}`);
        },
      },
    });
  };
  const s = document.createElement('script');
  s.id = 'yt-api';
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => set('yt.api', 'fail', 'could not load iframe_api');
  document.head.append(s);
}

// ---------- Google Maps link hand-off ----------
function armLinkTest(id) {
  const pending = { id, t: Date.now(), hidden: false };
  saveJSON(PENDING_KEY, pending);
  set('maps.' + id, 'info', 'tapped… waiting');
  setTimeout(() => {
    const p = loadJSON(PENDING_KEY, null);
    if (p && p.id === id && !p.hidden && document.visibilityState === 'visible') {
      set('maps.' + id, 'warn', 'nothing happened within 5 s (still on this page)');
      localStorage.removeItem(PENDING_KEY);
    }
  }, 5000);
}
function checkPendingLinkOnLoad() {
  const p = loadJSON(PENDING_KEY, null);
  if (!p) return;
  localStorage.removeItem(PENDING_KEY);
  if (Date.now() - p.t < 10 * 60 * 1000 && !p.hidden) {
    set('maps.' + p.id, 'warn', 'this page was reloaded after the tap → link probably opened inside this browser, not the Google Maps app');
  }
}

// beforeunload fires when this page navigates away inside the browser, but not when the user switches apps.
let navigatingAway = false;
window.addEventListener('beforeunload', () => { navigatingAway = true; });

document.addEventListener('visibilitychange', () => {
  log(`page ${document.visibilityState} · YouTube: ${ytStateName()}`);
  const p = loadJSON(PENDING_KEY, null);
  if (document.visibilityState === 'hidden' && p && !p.hidden && !navigatingAway && Date.now() - p.t < 5000) {
    p.hidden = true;
    saveJSON(PENDING_KEY, p);
    set('maps.' + p.id, 'ok', `page hidden ${((Date.now() - p.t) / 1000).toFixed(1)} s after tap → another app or tab opened (did Google Maps start navigation?)`);
  }
  if (document.visibilityState === 'visible') {
    if (p && p.hidden) localStorage.removeItem(PENDING_KEY);
    if (ytPlayer) set('yt.afterReturn', 'info', `YouTube state after returning: ${ytStateName()}`);
  }
});
window.addEventListener('pageshow', (e) => { if (e.persisted) log('restored from back/forward cache'); });
window.addEventListener('resize', checkViewport);

// ---------- report ----------
async function copyReport() {
  render();
  const text = $('report').value;
  try {
    await navigator.clipboard.writeText(text);
    log('report copied to clipboard');
    return;
  } catch { /* fall through */ }
  const ta = $('report');
  ta.focus();
  ta.select();
  const ok = document.execCommand && document.execCommand('copy');
  log(ok ? 'report copied (fallback)' : 'copy failed: select the text box and copy by hand');
}
async function unregisterSW() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  log(`removed ${regs.length} service worker(s)`);
}

// ---------- wire up ----------
$('btn-geo').addEventListener('click', startGeo);
$('btn-speak-th').addEventListener('click', () => speak('th-TH', 'ความเร็วเกิน 90 กิโลเมตรต่อชั่วโมง', 'tts.testThai'));
$('btn-speak-en').addEventListener('click', () => speak('en-US', 'Over 90 kilometers per hour', 'tts.testEnglish'));
$('btn-listen').addEventListener('click', listen);
$('btn-wakelock').addEventListener('click', wakeLock);
$('btn-fullscreen').addEventListener('click', toggleFullscreen);
$('btn-yt-load').addEventListener('click', loadYouTube);
$('btn-yt-play').addEventListener('click', () => ytPlayer?.playVideo?.());
$('btn-yt-pause').addEventListener('click', () => ytPlayer?.pauseVideo?.());
$('btn-copy').addEventListener('click', copyReport);
$('btn-sw-unregister').addEventListener('click', unregisterSW);
$('lnk-maps-https').addEventListener('click', () => armLinkTest('linkHttpsSameTab'));
$('lnk-maps-https-blank').addEventListener('click', () => armLinkTest('linkHttpsNewTab'));
$('lnk-maps-scheme').addEventListener('click', () => armLinkTest('linkScheme'));

checkPendingLinkOnLoad();
checkEnvironment();
checkViewport();
checkPresence();
checkVoices();
checkStorage();
checkServiceWorker();
checkHeaders();
render();
log('probe loaded');
