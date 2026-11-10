import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl } from '../../src/apps/youtube/parseYouTubeUrl';

const ID = 'M7lc1UVf-VE';
const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

describe('parseYouTubeUrl (§8.3)', () => {
  const cases: [string, ReturnType<typeof parseYouTubeUrl>][] = [
    [`https://www.youtube.com/watch?v=${ID}`, { videoId: ID }],
    [`https://youtube.com/watch?v=${ID}&feature=share`, { videoId: ID }],
    [`youtube.com/watch?v=${ID}`, { videoId: ID }],
    [`https://m.youtube.com/watch?v=${ID}`, { videoId: ID }],
    [`https://music.youtube.com/watch?v=${ID}&si=abc`, { videoId: ID }],
    [`https://youtu.be/${ID}`, { videoId: ID }],
    [`https://youtu.be/${ID}?si=xyz&t=90`, { videoId: ID, start: 90 }],
    [`https://www.youtube.com/shorts/${ID}`, { videoId: ID }],
    [`https://www.youtube.com/live/${ID}?feature=shared`, { videoId: ID }],
    [`https://www.youtube.com/embed/${ID}?start=30`, { videoId: ID, start: 30 }],
    [`https://www.youtube.com/watch?v=${ID}&t=1m5s`, { videoId: ID, start: 65 }],
    [`https://www.youtube.com/playlist?list=${LIST}`, { playlistId: LIST }],
    [`https://www.youtube.com/watch?v=${ID}&list=${LIST}`, { videoId: ID, playlistId: LIST }],
    [`https://music.youtube.com/playlist?list=${LIST}`, { playlistId: LIST }],
    [ID, { videoId: ID }],
    [`  https://youtu.be/${ID}  `, { videoId: ID }],
  ];
  for (const [input, expected] of cases) {
    it(input.trim(), () => expect(parseYouTubeUrl(input)).toEqual(expected));
  }

  it.each([
    '',
    'hello world',
    'https://example.com/watch?v=' + ID,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/UC123',
    'javascript:alert(1)',
    'https://youtu.be/',
    'ftp://youtube.com/watch?v=' + ID,
  ])('rejects %s', (input) => expect(parseYouTubeUrl(input)).toBeNull());
});
