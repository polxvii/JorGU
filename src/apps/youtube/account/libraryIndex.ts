// Library-first search (spec §8.4): match titles from cached playlists + liked videos on the device before
// spending search quota. Thai has no spaces, so the query is split with Intl.Segmenter('th') when available and
// each word is matched as a substring; without Segmenter, words are split on spaces.
import type { VideoItem } from '../../../../shared/ytTypes';

export interface LibraryEntry extends VideoItem {
  /** Where it came from: a playlist title, or '' for liked videos. */
  source: string;
}

/** Voice-style prefixes ("play X", "เปิดเพลง X"). Longest first. */
const PREFIX = /^(?:play|เปิดเพลง|เล่นเพลง|เปิดคลิป|เปิด|เล่น)\s*/u;

export function normalize(s: string): string {
  return s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function stripPrefix(q: string): string {
  return normalize(q).replace(PREFIX, '').trim();
}

let defaultSegmenter: Intl.Segmenter | null | undefined;
function getSegmenter(): Intl.Segmenter | null {
  if (defaultSegmenter === undefined) {
    defaultSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  }
  return defaultSegmenter;
}

export function queryTerms(q: string, seg: Intl.Segmenter | null = getSegmenter()): string[] {
  const text = stripPrefix(q);
  if (!text) return [];
  const words = seg ? [...seg.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment) : text.split(' ');
  return [...new Set(words.filter(Boolean))];
}

/** Best matches first: whole phrase in the title, then in title+channel, then every word somewhere. */
export function searchLibrary(items: LibraryEntry[], q: string, limit = 20, seg: Intl.Segmenter | null = getSegmenter()): LibraryEntry[] {
  const phrase = stripPrefix(q);
  const terms = queryTerms(q, seg);
  if (!phrase || terms.length === 0) return [];
  const seen = new Set<string>();
  const scored: { item: LibraryEntry; score: number }[] = [];
  for (const item of items) {
    if (seen.has(item.videoId)) continue;
    const title = normalize(item.title);
    const hay = `${title} ${normalize(item.channel)}`;
    let score: number;
    if (title.includes(phrase)) score = 3;
    else if (hay.includes(phrase)) score = 2;
    else if (terms.every((w) => hay.includes(w))) score = 1;
    else continue;
    seen.add(item.videoId);
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
