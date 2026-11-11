// Shapes returned by the Worker's /api/yt/* endpoints (spec §8.2). Shared by worker/ and src/.

export interface VideoItem {
  videoId: string;
  title: string;
  channel: string;
  thumb: string;
  publishedAt?: string;
  /** Seconds (videos.list contentDetails.duration); 0 for live streams. Only on New and Trending. */
  duration?: number;
}

export interface PlaylistItem {
  id: string;
  title: string;
  count: number;
  thumb: string;
}

/** A YouTube video category (videoCategories.list), title in the UI language. */
export interface CategoryItem {
  id: string;
  title: string;
}

export interface ChannelItem {
  channelId: string;
  title: string;
  thumb: string;
}

export interface Profile {
  email: string;
  name: string;
  picture: string;
}

/** `configured: false` = the server has no OAuth secrets (or there is no Worker, e.g. `vite dev`). */
export type MeResponse = ({ connected: true } & Profile) | { connected: false; configured?: boolean };
