// Device position for the map (spec §7.1): one watchPosition for the whole app, started when the Map app first
// shows. In the CarPlay host app geolocation depends on its permission (§3.10): without it the map still works
// by search, and the position/speed readouts stay hidden.
import { create } from 'zustand';

export interface Position {
  lat: number;
  lng: number;
  /** m/s, null when the device doesn't report it. */
  speed: number | null;
  heading: number | null;
  accuracy: number;
  at: number;
}

interface GeoState {
  pos: Position | null;
  error: 'denied' | 'unavailable' | null;
  watching: boolean;
  start: () => void;
  /** Ask once more (from a tap, so a browser that allows it can show its permission prompt again). */
  retry: () => void;
}

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };

export const useGeo = create<GeoState>()((set, get) => ({
  pos: null,
  error: null,
  watching: false,
  start: () => {
    if (get().watching) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      set({ error: 'unavailable' });
      return;
    }
    set({ watching: true });
    navigator.geolocation.watchPosition(onPos, onErr, OPTIONS);
  },
  retry: () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (!get().watching) get().start();
    navigator.geolocation.getCurrentPosition(onPos, onErr, OPTIONS);
  },
}));

function onPos(p: GeolocationPosition): void {
  useGeo.setState({
    error: null,
    pos: {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      speed: p.coords.speed,
      heading: p.coords.heading,
      accuracy: p.coords.accuracy,
      at: p.timestamp,
    },
  });
}

function onErr(e: GeolocationPositionError): void {
  // A timeout while a fix already exists isn't worth a message.
  if (e.code === e.TIMEOUT && useGeo.getState().pos) return;
  useGeo.setState({ error: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' });
}

export const kmh = (mps: number | null): number | null => (mps === null || mps < 0 ? null : Math.round(mps * 3.6));
