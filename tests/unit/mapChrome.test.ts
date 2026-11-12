// Map toolbar and route box placement (mapChrome.ts) and the navigation camera maths (routeMath.ts).
import { describe, expect, it } from 'vitest';
import { MAP_GAP, ROUTE_BOX, type MapChromeInput, placeMapChrome } from '../../src/apps/map/mapChrome';
import { aheadBearing, bearing, cameraCenter, haversine, metersPerPixel, offsetPoint, turn } from '../../src/apps/map/routeMath';
import { MAP_STRIP_PAD } from '../../src/shell/computeLayout';
import { type Rect, intersects } from '../../src/shell/geometry';

const base: MapChromeInput = { w: 464, h: 600, top: 60, btn: 56, items: 6, right: true, avoid: [], routeBox: false, routeBoxAt: 'bottom' };
const inside = (r: Rect, area: Rect) => r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h;
const STRIP = 56 + 2 * MAP_STRIP_PAD;

describe('map toolbar strip', () => {
  it('flush to the driver-side edge, full height; the map beside it, never under it', () => {
    const c = placeMapChrome(base);
    expect(c.strip).toEqual({ x: 464 - STRIP, y: 0, w: STRIP, h: 600 });
    expect(c.canvas).toEqual({ x: 0, y: 0, w: 464 - STRIP, h: 600 });
    expect(c.buttons).toMatchObject({ x: 464 - STRIP + MAP_STRIP_PAD, y: 60, w: 56 });
    expect(intersects(c.canvas, c.strip)).toBe(false);
    const left = placeMapChrome({ ...base, right: false });
    expect(left.strip.x).toBe(0);
    expect(left.canvas.x).toBe(STRIP);
  });

  it('all buttons when they fit; otherwise the last slot is More', () => {
    expect(placeMapChrome({ ...base, items: 8 })).toMatchObject({ shown: 8, more: false });
    // 330-px pane below a 56-px header: 4 slots for 8 buttons → 3 + More.
    expect(placeMapChrome({ ...base, h: 330, items: 8 })).toMatchObject({ shown: 3, more: true });
  });

  it('stops above a mini player on that edge, starts below a bar over its top', () => {
    const mini = { x: 464 - 12 - 356, y: 600 - 12 - 248, w: 356, h: 248 };
    const c = placeMapChrome({ ...base, items: 8, avoid: [mini] });
    expect(c.buttons.y + c.buttons.h).toBeLessThanOrEqual(mini.y);
    expect(intersects(c.buttons, mini)).toBe(false);
    const bar = { x: 100, y: 8, w: 364, h: 150 };
    const d = placeMapChrome({ ...base, top: 8, avoid: [bar] });
    expect(d.buttons.y).toBe(8 + 150 + MAP_GAP);
  });

  it('other edge when the mini player covers nearly all of the driver-side edge', () => {
    const mini = { x: 1024 - 12 - 356, y: 330 - 12 - 248, w: 356, h: 248 };
    const c = placeMapChrome({ ...base, w: 1024, h: 330, items: 8, avoid: [mini] });
    expect(c.right).toBe(false);
    expect(intersects(c.buttons, mini)).toBe(false);
  });

  it('scales with the Toolbar size', () => {
    const c = placeMapChrome({ ...base, btn: 72 });
    expect(c.strip.w).toBe(72 + 2 * MAP_STRIP_PAD);
    expect(c.buttons.w).toBe(72);
  });
});

describe('route box', () => {
  const withBox = { ...base, items: 8, routeBox: true };

  it('far corner of the map from the strip: bottom by default, top when chosen', () => {
    const b = placeMapChrome(withBox).routeBox!;
    expect(b).toEqual({ x: MAP_GAP, y: 600 - MAP_GAP - ROUTE_BOX.h, w: ROUTE_BOX.w, h: ROUTE_BOX.h });
    expect(placeMapChrome({ ...withBox, routeBoxAt: 'top' }).routeBox!.y).toBe(60);
    const left = placeMapChrome({ ...withBox, right: false });
    expect(left.routeBox!.x + left.routeBox!.w).toBe(464 - MAP_GAP);
  });

  it('on the map (never on the strip), clear of the mini player and the full-screen bar where there is room', () => {
    const cases: [number, number, number, boolean][] = [[464, 600, 60, false], [430, 330, 60, false], [356, 300, 60, false], [1024, 600, 8, true], [430, 860, 8, true]];
    for (const [w, h, top, full] of cases)
      for (const btn of [56, 64, 72])
        for (const at of ['top', 'bottom'] as const)
          for (const right of [true, false])
            for (const miniRight of [true, false])
              for (const withMini of [false, true]) {
                const sw = btn + 2 * MAP_STRIP_PAD;
                const mini = { x: miniRight ? w - 12 - 356 : 12, y: h - 12 - 248, w: 356, h: 248 };
                // computeLayout: the bar goes away from the mini player, and inside the strip when on its side.
                const barRight = withMini ? !miniRight : right;
                const inset = barRight === right ? sw : 0;
                const bar =
                  w > h
                    ? { x: barRight ? w - inset - 32 - (btn + 16) : inset + 32, y: 60, w: btn + 16, h: 7 * (btn + 8) + 8 }
                    : { x: barRight ? w - inset - 12 - (4 * (btn + 8) + 8) : inset + 12, y: 12, w: 4 * (btn + 8) + 8, h: 2 * (btn + 8) + 8 };
                const avoid: Rect[] = [...(withMini ? [mini] : []), ...(full ? [bar] : [])];
                const c = placeMapChrome({ w, h, top, btn, items: 8, right, avoid, routeBox: true, routeBoxAt: at });
                const ctx = JSON.stringify({ w, h, btn, at, right, miniRight, withMini, full });
                const box = c.routeBox!;
                expect(inside(box, c.canvas), ctx).toBe(true);
                expect(intersects(box, c.strip), ctx).toBe(false);
                if (full) expect(intersects(c.strip, bar), `bar over strip ${ctx}`).toBe(false);
                if (h >= 600) for (const a of avoid) expect(intersects(box, a), `box ${ctx}`).toBe(false);
                // Buttons never under the bar; under the mini player only when it leaves no room on either edge.
                if (full) expect(intersects(c.buttons, bar), `buttons/bar ${ctx}`).toBe(false);
                const roomBeside = 356 + 2 * sw <= w || h - 12 - 248 - top >= btn + MAP_GAP;
                if (withMini && roomBeside) expect(intersects(c.buttons, mini), `buttons/mini ${ctx}`).toBe(false);
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
