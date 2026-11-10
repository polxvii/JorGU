import { describe, expect, it } from 'vitest';
import { type QueueData, nextIndex, prevIndex, rebuildOrder } from '../../src/apps/youtube/queueStore';
import { applicableRate, formatSpeed, nextSpeed } from '../../src/apps/youtube/speed';

const q = (over: Partial<QueueData> = {}): QueueData => {
  const items = over.items ?? ['a', 'b', 'c'].map((v, i) => ({ key: String(i), videoId: v.padEnd(11, 'x') }));
  const base = { items, index: 0, repeat: 'off' as const, shuffle: false, ...over };
  return { ...base, order: over.order ?? rebuildOrder(base) };
};

describe('queue navigation', () => {
  it('advances in order and stops at the end', () => {
    expect(nextIndex(q({ index: 0 }))).toBe(1);
    expect(nextIndex(q({ index: 2 }))).toBeNull();
  });
  it('repeat all wraps; repeat one stays unless manual', () => {
    expect(nextIndex(q({ index: 2, repeat: 'all' }))).toBe(0);
    expect(nextIndex(q({ index: 1, repeat: 'one' }))).toBe(1);
    expect(nextIndex(q({ index: 1, repeat: 'one' }), true)).toBe(2);
  });
  it('previous', () => {
    expect(prevIndex(q({ index: 1 }))).toBe(0);
    expect(prevIndex(q({ index: 0 }))).toBeNull();
    expect(prevIndex(q({ index: 0, repeat: 'all' }))).toBe(2);
  });
  it('shuffle keeps the current item first and covers every item once', () => {
    const order = rebuildOrder({ items: q().items, index: 2, shuffle: true }, () => 0.3);
    expect(order[0]).toBe(2);
    expect([...order].sort()).toEqual([0, 1, 2]);
  });
  it('empty queue has no next', () => {
    expect(nextIndex(q({ items: [], order: [] }))).toBeNull();
  });
});

describe('playback speed (user request)', () => {
  const all = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  it('cycles 1 → 1.5 → 2 → 1 (no 1.25×, user request)', () => {
    expect(nextSpeed(1, all)).toBe(1.5);
    expect(nextSpeed(1.5, all)).toBe(2);
    expect(nextSpeed(2, all)).toBe(1);
  });
  it('from a non-preset rate goes to the first preset', () => {
    expect(nextSpeed(1.75, all)).toBe(1);
  });
  it('live streams (only 1×) stay at 1', () => {
    expect(nextSpeed(1, [1])).toBe(1);
  });
  it('applies the saved rate, or the closest lower supported rate', () => {
    expect(applicableRate(2, all)).toBe(2);
    expect(applicableRate(2, [1])).toBe(1);
    expect(applicableRate(1.5, [0.5, 1, 1.25])).toBe(1.25);
  });
  it('formats', () => {
    expect(formatSpeed(2)).toBe('2×');
    expect(formatSpeed(1.25)).toBe('1.25×');
    expect(formatSpeed(1.5)).toBe('1.5×');
  });
});
