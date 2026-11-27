import createClient from "openapi-fetch";

import { API_URL } from "@/lib/env";
import { getAccessToken, refreshAccessToken } from "@/lib/session/token-store";

import { ApiError, toApiError } from "./errors";
import type { paths } from "./schema";

/** Adds the bearer token and retries once after a silent refresh when the access token has expired. */
async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const token = await getAccessToken();
  if (token) input.headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input);
  if (res.status !== 401 || !token) return res;
  const fresh = await refreshAccessToken();
  if (!fresh) return res;
  retry.headers.set("Authorization", `Bearer ${fresh}`);
  return fetch(retry);
}

/** Typed client generated from the backend OpenAPI (src/lib/api/schema.d.ts, never edited by hand). */
export const api = createClient<paths>({ baseUrl: API_URL, fetch: authFetch });

/** Turn an openapi-fetch result into data or a thrown ApiError carrying the error envelope. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await p;
  } catch {
    throw new ApiError(0, "network_error", "The server did not respond. Check your connection and try again.");
  }
  const { data, error, response } = result;
  if (error !== undefined || !response.ok) {
    const e = (error ?? {}) as { error?: { code?: string; message?: string; details?: unknown } };
    if (e.error) {
      throw new ApiError(response.status, e.error.code ?? "http_error", e.error.message ?? "Request failed.", e.error.details,
        response.headers.get("X-Request-ID") ?? undefined);
    }
    throw await toApiError(response);
  }
  return data as T;
}

export type Schemas = import("./schema").components["schemas"];
