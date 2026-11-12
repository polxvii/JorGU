// Map toolbar and route box placement (mapChrome.ts) and the navigation camera maths (routeMath.ts).
import { describe, expect, it } from 'vitest';
import { MAP_GAP, ROUTE_BOX, type MapChromeInput, placeMapChrome } from '../../src/apps/map/mapChrome';
import { aheadBearing, bearing, cameraCenter, haversine, metersPerPixel, offsetPoint, turn } from '../../src/apps/map/routeMath';
import { type Rect, intersects } from '../../src/shell/geometry';

const base: MapChromeInput = { w: 464, h: 600, top: 60, btn: 56, items: 6, preferRight: true, avoid: [], routeBox: false, routeBoxAt: 'bottom' };
const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

describe('map toolbar', () => {
  it('one column on the driver side when it fits', () => {
    const c = placeMapChrome(base);
    expect(c).toMatchObject({ right: true, rows: 6, cols: 1 });
    expect(c.toolbar).toEqual({ x: 464 - MAP_GAP - 56, y: 60, w: 56, h: 6 * 56 + 5 * MAP_GAP });
    expect(placeMapChrome({ ...base, preferRight: false }).toolbar.x).toBe(MAP_GAP);
  });

  it('wraps into more columns on a short pane (route buttons added), never past the bottom', () => {
    const c = placeMapChrome({ ...base, h: 300, items: 9 });
    expect(c.rows).toBe(3);
    expect(c.cols).toBe(3);
    expect(c.toolbar.y + c.toolbar.h).toBeLessThanOrEqual(300);
  });

  it('moves to the other side when the full-screen bar or the mini player is on the driver side', () => {
    const bar = { x: 464 - 32 - 80, y: 100, w: 80, h: 400 };
    const c = placeMapChrome({ ...base, avoid: [bar] });
    expect(c.right).toBe(false);
    expect(intersects(c.toolbar, bar)).toBe(false);
  });

  it('goes below the obstacle when both sides are blocked at the top (portrait full-screen bar)', () => {
    const bar = { x: 0, y: 12, w: 430, h: 160 };
    const c = placeMapChrome({ ...base, w: 430, h: 860, top: 8, avoid: [bar] });
    expect(c.toolbar.y).toBe(12 + 160 + MAP_GAP);
    expect(intersects(c.toolbar, bar)).toBe(false);
  });

  it('scales with the Toolbar size (button size)', () => {
    const c = placeMapChrome({ ...base, btn: 72 });
    expect(c.toolbar.w).toBe(72);
    expect(c.toolbar.h).toBe(6 * 72 + 5 * MAP_GAP);
  });
});

describe('route box', () => {
  const withBox = { ...base, items: 9, routeBox: true };

  it('bottom corner on the other side of the toolbar by default; top when chosen', () => {
    const b = placeMapChrome(withBox).routeBox!;
    expect(b).toEqual({ x: MAP_GAP, y: 600 - MAP_GAP - ROUTE_BOX.h, w: ROUTE_BOX.w, h: ROUTE_BOX.h });
    const t = placeMapChrome({ ...withBox, routeBoxAt: 'top' }).routeBox!;
    expect(t.y).toBe(60);
    const left = placeMapChrome({ ...withBox, preferRight: false });
    expect(left.routeBox!.x + left.routeBox!.w).toBe(464 - MAP_GAP);
  });

  it('never covers the toolbar, the mini player or the full-screen bar, and stays on screen', () => {
    // Panes (header band, maybe a mini player) and full screen (floating bar on the side away from the mini player,
    // as computeLayout places it: a column mid-height in landscape, a band at the top in portrait).
    const cases: [number, number, number, boolean][] = [[464, 600, 60, false], [430, 330, 60, false], [356, 300, 60, false], [1024, 600, 8, true], [430, 860, 8, true]];
    for (const [w, h, top, full] of cases)
      for (const btn of [56, 64, 72])
        for (const at of ['top', 'bottom'] as const)
          for (const driverRight of [true, false])
            for (const miniRight of [true, false])
              for (const withMini of [false, true]) {
                const mini = { x: miniRight ? w - 12 - 356 : 12, y: h - 12 - 248, w: 356, h: 248 };
                const barRight = withMini ? !miniRight : driverRight;
                const bar =
                  w > h
                    ? { x: barRight ? w - 32 - (btn + 16) : 32, y: 60, w: btn + 16, h: 7 * (btn + 8) + 8 }
                    : { x: barRight ? w - 12 - (4 * (btn + 8) + 8) : 12, y: 12, w: 4 * (btn + 8) + 8, h: 2 * (btn + 8) + 8 };
                const avoid: Rect[] = [...(withMini ? [mini] : []), ...(full ? [bar] : [])];
                const c = placeMapChrome({ w, h, top, btn, items: 9, preferRight: driverRight, avoid, routeBox: true, routeBoxAt: at });
                const ctx = JSON.stringify({ w, h, btn, at, driverRight, miniRight, withMini, full });
                const box = c.routeBox!;
                expect(intersects(box, c.toolbar), ctx).toBe(false);
                expect(inside(box, w, h), ctx).toBe(true);
                expect(inside(c.toolbar, w, h), ctx).toBe(true);
                // Where there's room, nothing sits under the floating bar or the mini player.
                if (h >= 600) {
                  for (const a of avoid) expect(intersects(c.toolbar, a), `toolbar ${ctx}`).toBe(false);
                  for (const a of avoid) expect(intersects(box, a), `box ${ctx}`).toBe(false);
                }
              }
  });
});

describe('navigation camera maths', () => {
  const car = { lat: 13.7563, lng: 100.5018 };

  it('bearing: north 0°, east 90°, south 180°', () => {
    expect(bearing(car, { lat: car.lat + 0.01, lng: car.lng })).toBeCloseTo(0, 1);
    expect(bearing(car, { lat: car.lat, lng: car.lng + 0.01 })).toBeCloseTo(90, 0);
    expect(bearing(car, { lat: car.lat - 0.01, lng: car.lng })).toBeCloseTo(180, 1);
  });

  it('offsetPoint goes the right distance and way', () => {
    const p = offsetPoint(car, 45, 500);
    expect(haversine(car, p)).toBeCloseTo(500, 0);
    expect(bearing(car, p)).toBeCloseTo(45, 0);
  });

  it('road ahead on the line; null when off the route', () => {
    const east = [car, { lat: car.lat, lng: car.lng + 0.01 }, { lat: car.lat + 0.01, lng: car.lng + 0.01 }];
    expect(aheadBearing({ lat: car.lat + 0.0001, lng: car.lng + 0.002 }, east)).toBeCloseTo(90, 0);
    // Near the corner the road ahead turns north.
    expect(aheadBearing({ lat: car.lat, lng: car.lng + 0.0099 }, east, 200)).toBeLessThan(45);
    expect(aheadBearing({ lat: car.lat + 0.01, lng: car.lng }, east)).toBeNull();
  });

  it('camera centre: ahead of the car by 25 % of the screen height', () => {
    const c = cameraCenter(car, 90, 16, 150);
    expect(haversine(car, c)).toBeCloseTo(150 * metersPerPixel(car.lat, 16), 0);
    expect(bearing(car, c)).toBeCloseTo(90, 0);
  });

  it('shortest turn across north', () => {
    expect(turn(350, 10)).toBe(20);
    expect(turn(10, 350)).toBe(-20);
    expect(turn(0, 180)).toBe(-180);
  });
});
