// Shapes shared by the Worker (/api/frame-check) and the Web app (spec §9.3).

export type FrameStatus = 'allowed' | 'blocked' | 'unknown';

export interface FrameCheckResult {
  status: FrameStatus;
  /** URL after redirects (the last one fetched). */
  finalUrl: string;
  /** Short machine reason: csp-none, csp-mismatch, xfo-deny, xfo-sameorigin, no-headers, fetch, dns, redirects … */
  reason: string;
}
