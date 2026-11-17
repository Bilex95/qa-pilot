/**
 * Session handlers (D-039): the only code that sees the refresh token. It lives in an httpOnly cookie scoped to
 * /api/session; the browser only ever receives the short lived access token.
 *   POST /api/session/login     {email, password}
 *   POST /api/session/register  {full_name, email, password}
 *   POST /api/session/refresh
 *   POST /api/session/logout    (Authorization: Bearer <access token>)
 */
import { NextResponse, type NextRequest } from "next/server";

import { BACKEND_INTERNAL_URL } from "@/lib/env";

const COOKIE = "qp_rt";
const MAX_AGE = 60 * 60 * 24 * 7; // REFRESH_TOKEN_DAYS (D-010)
const secure = process.env.APP_ENV === "production";

type Tokens = { access_token: string; refresh_token: string; expires_in: number; user?: unknown };

function envelope(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, details: {} } }, { status });
}

function withCookie(res: NextResponse, token: string | null): NextResponse {
  if (token) {
    res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/api/session", maxAge: MAX_AGE });
  } else {
    res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/api/session", maxAge: 0 });
  }
  return res;
}

async function backend(path: string, init: RequestInit & { userAgent?: string | null }): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.userAgent) headers.set("User-Agent", init.userAgent);
  return fetch(`${BACKEND_INTERNAL_URL}/api/v1${path}`, { ...init, headers, cache: "no-store" });
}

async function passError(res: Response): Promise<NextResponse> {
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}

async function issue(path: "/auth/login" | "/auth/register", req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return envelope(422, "validation_error", "Send a JSON body.");
  }
  const res = await backend(path, { method: "POST", body: JSON.stringify(body), userAgent: req.headers.get("user-agent") });
  if (!res.ok) return passError(res);
  const tokens = (await res.json()) as Tokens;
  const out = NextResponse.json({ access_token: tokens.access_token, expires_in: tokens.expires_in, user: tokens.user },
    { status: res.status });
  return withCookie(out, tokens.refresh_token);
}

async function refresh(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return envelope(401, "invalid_refresh_token", "Sign in to continue.");
  const res = await backend("/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: token }),
    userAgent: req.headers.get("user-agent") });
  if (res.status === 401) {
    // Keep the cookie: another tab may have rotated it; the client retries once (D-039)
    return passError(res);
  }
  if (!res.ok) return passError(res);
  const tokens = (await res.json()) as Tokens;
  return withCookie(NextResponse.json({ access_token: tokens.access_token, expires_in: tokens.expires_in }), tokens.refresh_token);
}

async function logout(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const auth = req.headers.get("authorization");
  if (token && auth) {
    await backend("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: token }),
      headers: { Authorization: auth } }).catch(() => undefined);
  }
  return withCookie(new NextResponse(null, { status: 204 }), null);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }): Promise<NextResponse> {
  const { action } = await ctx.params;
  try {
    switch (action) {
      case "login":
        return await issue("/auth/login", req);
      case "register":
        return await issue("/auth/register", req);
      case "refresh":
        return await refresh(req);
      case "logout":
        return await logout(req);
      default:
        return envelope(404, "not_found", "Not found.");
    }
  } catch {
    return envelope(502, "backend_unavailable", "The server did not respond. Try again in a moment.");
  }
}
