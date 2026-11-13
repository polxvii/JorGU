// Web app pure logic: URL normalization (§9.2), view emulation (§9.7), bookmarks/recent/view memory (§9.1, §13).
import { describe, expect, it } from 'vitest';
import { addBookmark, removeBookmark, setPaneUrl, setViewModeFor, updateBookmark, withRecent } from '../../src/apps/web/webActions';
import { hostLabel, normalizeUrl, toHttps } from '../../src/apps/web/normalizeUrl';
import { AUTO, resolveViewMode, sameView, viewBox } from '../../src/apps/web/viewMode';
import { defaultSettings } from '../../src/features/settings/types';
import { assignApp } from '../../src/shell/layoutActions';

describe('normalizeUrl (§9.2)', () => {
  it('bare domains get https://; http stays as typed (the app upgrades it when embedding)', () => {
    expect(normalizeUrl('example.com')).toEqual({ ok: true, url: 'https://example.com/' });
    expect(normalizeUrl('  www.example.com/path?q=1 ')).toEqual({ ok: true, url: 'https://www.example.com/path?q=1' });
    expect(normalizeUrl('HTTPS://Example.COM')).toEqual({ ok: true, url: 'https://example.com/' });
    expect(normalizeUrl('http://example.com')).toEqual({ ok: true, url: 'http://example.com/' });
    expect(toHttps('http://example.com/a')).toBe('https://example.com/a');
  });

  it('rejects non-web schemes, non-addresses, and JorGu itself', () => {
    for (const s of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com', 'mailto:a@b.c', 'about:blank']) {
      expect(normalizeUrl(s), s).toMatchObject({ ok: false, reason: 'scheme' });
    }
    for (const s of ['weather bangkok', 'intranet', 'https://']) expect(normalizeUrl(s), s).toMatchObject({ ok: false });
    expect(normalizeUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeUrl('jorgu.example.dev/x', 'https://jorgu.example.dev')).toEqual({ ok: false, reason: 'self' });
    expect(normalizeUrl('http://jorgu.example.dev/', 'https://jorgu.example.dev')).toEqual({ ok: false, reason: 'self' });
  });

  it('labels drop www.', () => {
    expect(hostLabel('https://www.example.com/a')).toBe('example.com');
  });
});

describe('viewBox (§9.7)', () => {
  it('Auto = pane width at the zoom', () => {
    expect(viewBox(AUTO, 420, 374, 1280)).toEqual({ width: 420, height: 374, scale: 1, offsetX: 0 });
    expect(viewBox({ mode: 'auto', zoom: 1.5 }, 420, 374, 1280)).toMatchObject({ width: 280, scale: 1.5 });
  });

  it('Mobile renders 400 px wide, scaled to fit, capped at 2× and centred', () => {
    expect(viewBox({ mode: 'mobile' }, 420, 374, 1280)).toMatchObject({ width: 400, scale: 420 / 400, offsetX: 0 });
    const wide = viewBox({ mode: 'mobile' }, 1000, 600, 1280);
    expect(wide).toMatchObject({ width: 400, scale: 2, height: 300, offsetX: 100 });
  });

  it('Desktop renders at the chosen width, scaled down to the pane', () => {
    const v = viewBox({ mode: 'desktop' }, 640, 400, 1280);
    expect(v).toMatchObject({ width: 1280, scale: 0.5, height: 800, offsetX: 0 });
    expect(viewBox({ mode: 'desktop' }, 640, 400, 1024).width).toBe(1024);
  });

  it('never divides by zero', () => {
    expect(viewBox({ mode: 'desktop' }, 0, 0, 1280).scale).toBe(1);
  });
});

describe('web settings', () => {
  const web = () => defaultSettings().web;

  it('Recent keeps the last 10, newest first, no duplicates', () => {
    let r: string[] = [];
    for (let i = 0; i < 12; i++) r = withRecent(r, `https://s${i}.example/`);
    r = withRecent(r, 'https://s5.example/');
    expect(r).toHaveLength(10);
    expect(r[0]).toBe('https://s5.example/');
    expect(r.filter((u) => u === 'https://s5.example/')).toHaveLength(1);
  });

  it('bookmarks: add once per URL, rename (blank keeps the old title), pin, delete', () => {
    let w = addBookmark(web(), 'https://www.example.com/');
    w = addBookmark(w, 'https://www.example.com/');
    expect(w.bookmarks).toHaveLength(1);
    const id = w.bookmarks[0].id;
    expect(w.bookmarks[0]).toMatchObject({ title: 'example.com', pinned: false });
    w = updateBookmark(w, id, { title: '  News  ', pinned: true });
    expect(w.bookmarks[0]).toMatchObject({ title: 'News', pinned: true });
    w = updateBookmark(w, id, { title: '   ' });
    expect(w.bookmarks[0].title).toBe('News');
    expect(removeBookmark(w, id).bookmarks).toEqual([]);
  });

  it('view mode is remembered for the whole site: per origin and on its bookmarks', () => {
    let w = addBookmark(web(), 'https://a.example/home');
    w = addBookmark(w, 'https://c.example/');
    w = setViewModeFor(w, 'https://a.example/other', { mode: 'desktop' });
    expect(w.viewModes['https://a.example']).toEqual({ mode: 'desktop' });
    expect(resolveViewMode('https://a.example/x', w.bookmarks, w.viewModes)).toEqual({ mode: 'desktop' });
    // The site's bookmark follows (user 2026-11-13: its older choice used to win, so zoom seemed not to stick).
    expect(w.bookmarks[0].viewMode).toEqual({ mode: 'desktop' });
    expect(resolveViewMode('https://a.example/home', w.bookmarks, w.viewModes)).toEqual({ mode: 'desktop' });
    expect(w.bookmarks[1].viewMode).toBeUndefined();
    w = setViewModeFor(w, 'https://a.example/home', { mode: 'mobile' });
    expect(resolveViewMode('https://a.example/home', w.bookmarks, w.viewModes)).toEqual({ mode: 'mobile' });
    expect(resolveViewMode('https://b.example/', w.bookmarks, w.viewModes)).toEqual(AUTO);
    // A new bookmark starts with its origin's view.
    w = addBookmark(w, 'https://a.example/new');
    expect(w.bookmarks[2].viewMode).toEqual({ mode: 'mobile' });
    expect(sameView({ mode: 'auto', zoom: 1 }, { mode: 'auto', zoom: 1.25 })).toBe(false);
  });

  it('setPaneUrl changes only that web instance; picking Web again resumes its last page', () => {
    let l = assignApp(defaultSettings().layout, 1, { kind: 'web', url: 'https://a.example/' });
    expect(l.panes[1]).toEqual({ kind: 'web', id: 'w1', url: 'https://a.example/' });
    l = setPaneUrl(l, 'w1', 'https://b.example/');
    expect(l.panes[1]).toMatchObject({ url: 'https://b.example/' });
    expect(setPaneUrl(l, 'w2', 'https://c.example/')).toBe(l);
    l = assignApp(l, 1, { kind: 'map' });
    l = assignApp(l, 1, { kind: 'web' }, { w1: 'https://b.example/' });
    expect(l.panes[1]).toEqual({ kind: 'web', id: 'w1', url: 'https://b.example/' });
  });
});
