/**
 * Access token kept in memory only (D-010, D-039). The refresh token lives in an httpOnly cookie that only the
 * Next.js session route handlers can read.
 */
let accessToken: string | null = null;
let expiresAt = 0;
let inflight: Promise<string | null> | null = null;
const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null, expiresInSeconds = 0): void {
  accessToken = token;
  expiresAt = token ? Date.now() + expiresInSeconds * 1000 : 0;
  listeners.forEach((l) => l(token));
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doRefresh(): Promise<string | null> {
  // One retry: another tab may have rotated the cookie a moment ago (backend grace window, D-039)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/session/refresh", { method: "POST", credentials: "same-origin" });
      if (res.ok) {
        const body = (await res.json()) as { access_token: string; expires_in: number };
        setAccessToken(body.access_token, body.expires_in);
        return body.access_token;
      }
      if (res.status !== 401 || attempt === 1) break;
    } catch {
      break;
    }
    await sleep(350);
  }
  setAccessToken(null);
  return null;
}

/** Share one refresh between every caller on the page (React strict mode mounts twice). */
export function refreshAccessToken(): Promise<string | null> {
  if (!inflight) inflight = doRefresh().finally(() => (inflight = null));
  return inflight;
}

export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < expiresAt - 30_000) return accessToken;
  return refreshAccessToken();
}

export function currentAccessToken(): string | null {
  return accessToken;
}
