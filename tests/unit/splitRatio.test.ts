import { describe, expect, it } from 'vitest';
import { ratioBounds, resolveRatio, snapRatio, splitFeasible } from '../../src/shell/splitRatio';

describe('splitRatio', () => {
  it('snaps within 2.5 % of 40/50/60', () => {
    expect(snapRatio(0.48)).toBe(0.5);
    expect(snapRatio(0.585)).toBe(0.6);
    expect(snapRatio(0.45)).toBe(0.45);
  });

  it('clamps to 30–70 % without YouTube', () => {
    const b = ratioBounds(1000, null);
    expect(resolveRatio(0.1, b)).toBe(0.3);
    expect(resolveRatio(0.95, b)).toBe(0.7);
  });

  it('keeps the YouTube pane ≥ 356 px (§3.9)', () => {
    const usable = 734; // iPhone 16 Pro Max landscape minus safe areas, dock, gap
    const b0 = ratioBounds(usable, 0);
    expect(Math.round(usable * resolveRatio(0.3, b0))).toBeGreaterThanOrEqual(356);
    const b1 = ratioBounds(usable, 1);
    expect(Math.round(usable * (1 - resolveRatio(0.7, b1)))).toBeGreaterThanOrEqual(356);
  });

  it('reports infeasible split when the screen is too narrow for a 356 px YouTube pane', () => {
    expect(splitFeasible(ratioBounds(464, 0))).toBe(false);
    expect(splitFeasible(ratioBounds(600, 0))).toBe(true);
  });
});
