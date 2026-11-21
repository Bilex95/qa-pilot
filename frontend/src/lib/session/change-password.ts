import { toApiError } from "@/lib/api/errors";

import { getAccessToken, setAccessToken } from "./token-store";

/**
 * Change the signed in person's password (API-016, D-055). It goes through the session route, which replaces the refresh
 * cookie with the new pair the backend returns; the new access token replaces the one in memory. Every other session of
 * this person ends. Throws an ApiError (400 wrong_password, 422 for the password rule).
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch("/api/session/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    credentials: "same-origin",
  });
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  setAccessToken(data.access_token, data.expires_in);
}
