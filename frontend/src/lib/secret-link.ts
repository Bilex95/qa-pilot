/**
 * Secrets that arrive in a link (BL-014, D-055). An invitation token or a reset token is carried in the URL fragment
 * (`/invite#<token>`), which a browser never sends to a server or in a Referer header. The page reads it once, removes it
 * from the address bar at once (so it is not left in history) and sends it only in a request body. Nothing here logs it.
 */

import { useSyncExternalStore } from "react";

const INVITE_KEY = "qap.pendingInvite";
const INVITE_TTL_MS = 30 * 60 * 1000; // product owner: the invite token waits at most 30 minutes in this tab

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{10,200}$/;
/** `value`: the token or null. `gen`: a number that changes whenever a new fragment is read, so a query can tell two links apart without the token in its key. */
export type FragmentLink = { value: string | null; gen: number };
let fragment: FragmentLink | undefined;
let generation = 0;
const listeners = new Set<() => void>();
// Opening a link while already on the same page only changes the hash (no reload): tell the readers to look again
const onHashChange = () => notify();
const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener("hashchange", onHashChange);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("hashchange", onHashChange);
  };
};
const notify = () => listeners.forEach((l) => l());

/**
 * The token of the current page's fragment, read once and removed from the address bar with `history.replaceState`.
 * Later calls return the same value, because React may run an effect twice and the fragment is gone after the first read.
 * A new fragment (a link opened on the same page) is read again.
 */
function readFragment(): FragmentLink | undefined {
  if (typeof window === "undefined") return undefined;
  if (fragment && !window.location.hash) return fragment; // the same object every time, as useSyncExternalStore needs
  const raw = window.location.hash.replace(/^#/, "");
  if (raw) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  fragment = { value: TOKEN_SHAPE.test(raw) ? raw : null, gen: ++generation };
  return fragment;
}

export function takeFragmentToken(): string | null {
  return readFragment()?.value ?? null;
}

/** Forget the token that was read from the fragment (the flow has ended). */
export function forgetFragmentToken(): void {
  fragment = { value: null, gen: ++generation };
  notify();
}

/** The fragment link as React state: `undefined` while rendering on the server, then `{ value, gen }` (no setState in an effect). */
export function useFragmentLink(): FragmentLink | undefined {
  return useSyncExternalStore(subscribe, readFragment, () => undefined);
}

/** The invite token waiting in this tab, as React state: `undefined` on the server, then the token or null. */
export function usePendingInvite(): string | null | undefined {
  return useSyncExternalStore(subscribe, readPendingInvite, () => undefined);
}

// The invite token between pages: the person may have to sign in or register before accepting. It waits in sessionStorage,
// which belongs to this tab only, for 30 minutes at most, and is cleared on accept, on any error and on sign out.

export function savePendingInvite(token: string): void {
  try {
    window.sessionStorage.setItem(INVITE_KEY, JSON.stringify({ token, expires: Date.now() + INVITE_TTL_MS }));
  } catch {
    // storage blocked: the token stays in memory for this page only
  }
  notify();
}

export function readPendingInvite(): string | null {
  try {
    const raw = window.sessionStorage.getItem(INVITE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { token?: unknown; expires?: unknown };
    if (typeof saved.token === "string" && typeof saved.expires === "number" && saved.expires > Date.now() && TOKEN_SHAPE.test(saved.token)) {
      return saved.token;
    }
    window.sessionStorage.removeItem(INVITE_KEY);
  } catch {
    // unreadable: treat as none
  }
  return null;
}

export function hasPendingInvite(): boolean {
  return readPendingInvite() !== null;
}

export function clearPendingInvite(): void {
  try {
    window.sessionStorage.removeItem(INVITE_KEY);
  } catch {
    // nothing to clear
  }
  forgetFragmentToken(); // also tells every reader that the token is gone
}
