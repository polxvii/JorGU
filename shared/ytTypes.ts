// Shapes returned by the Worker's /api/yt/* endpoints (spec §8.2). Shared by worker/ and src/.

export interface VideoItem {
  videoId: string;
  title: string;
  channel: string;
  /** The channel's id (UC…), to mute a channel (user 2026-11-15). Missing on lists cached before. */
  channelId?: string;
  thumb: string;
  publishedAt?: string;
  /** Seconds (videos.list contentDetails.duration); 0 for live streams. On New, Trending, Search and videos.list. */
  duration?: number;
}

/** New from subscriptions, plus the muted channels the account is still subscribed to (they stay muted). */
export interface FeedResponse {
  items: VideoItem[];
  muted: { channelId: string; title: string }[];
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
