"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, unwrap, type Schemas } from "@/lib/api/client";
import { toApiError } from "@/lib/api/errors";
import { clearPendingInvite } from "@/lib/secret-link";

import { currentAccessToken, onTokenChange, refreshAccessToken, setAccessToken } from "./token-store";

export type Me = Schemas["MeOut"];
type Status = "loading" | "authenticated" | "anonymous";

type SessionValue = {
  status: Status;
  /** True after the user chose Sign out in this tab (no "come back here" redirect). */
  signedOut: boolean;
  me: Me | undefined;
  meLoading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (fullName: string, email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<Me | undefined>;
};

const SessionContext = createContext<SessionValue | null>(null);

async function postSession(action: "login" | "register", body: unknown): Promise<void> {
  const res = await fetch(`/api/session/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  setAccessToken(data.access_token, data.expires_in);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (currentAccessToken() ? "authenticated" : "loading"));
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    const off = onTokenChange((t) => setStatus(t ? "authenticated" : "anonymous"));
    if (!currentAccessToken()) {
      void refreshAccessToken().then((t) => setStatus(t ? "authenticated" : "anonymous"));
    }
    return () => {
      off();
    };
  }, []);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(api.GET("/api/v1/auth/me")),
    enabled: status === "authenticated",
    staleTime: 30_000,
  });

  const loadMe = useCallback(async () => {
    const me = await qc.fetchQuery({ queryKey: ["me"], queryFn: () => unwrap(api.GET("/api/v1/auth/me")) });
    return me;
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      await postSession("login", { email, password });
      setSignedOut(false);
      setStatus("authenticated");
      return loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      await postSession("register", { full_name: fullName, email, password });
      setSignedOut(false);
      setStatus("authenticated");
      return loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    const token = currentAccessToken();
    await fetch("/api/session/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "same-origin",
    }).catch(() => undefined);
    setSignedOut(true);
    setAccessToken(null);
    clearPendingInvite(); // an invitation that was waiting for sign in does not outlive the session (D-055)
    qc.clear();
  }, [qc]);

  const reloadMe = useCallback(async () => (await meQuery.refetch()).data, [meQuery]);

  const value = useMemo<SessionValue>(
    () => ({ status, signedOut, me: meQuery.data, meLoading: meQuery.isLoading, login, register, logout, reloadMe }),
    [status, signedOut, meQuery.data, meQuery.isLoading, login, register, logout, reloadMe],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** Where to go after signing in: the requested page, the first workspace, or workspace setup (D-021). */
export function homeFor(me: Me, next?: string | null): string {
  if (next) return next;
  const first = me.memberships[0];
  return first ? `/o/${first.org.slug}/dashboard` : "/onboarding/org";
}
