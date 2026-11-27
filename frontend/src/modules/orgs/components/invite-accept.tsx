"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { IconAlert } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Banner, LoadingPanel } from "@/components/ui/feedback";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ROLE_NAMES } from "@/lib/permissions";
import { clearPendingInvite, savePendingInvite, useFragmentLink, usePendingInvite } from "@/lib/secret-link";
import { useSession } from "@/lib/session/session-provider";

/**
 * SCR-04 Accept invitation (REQ-006, D-011, D-055). The link is `/invite#<token>`: the token is read from the fragment once,
 * removed from the address bar, kept in sessionStorage of this tab for at most 30 minutes (the person may have to sign in
 * or register first) and sent only in request bodies. It is cleared on accept, on any error and on sign out.
 */
export function InviteAccept() {
  const { status, me } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const link = useFragmentLink(); // undefined on the server and during hydration, then the link read from the fragment
  const fromLink = link?.value; // the token, null when there is none, undefined before it was read
  const waiting = usePendingInvite(); // the token kept in this tab while the person signs in
  const token = fromLink === undefined || waiting === undefined ? undefined : (fromLink ?? waiting);

  useEffect(() => {
    if (fromLink) savePendingInvite(fromLink); // keep it for the sign in or register step in between
  }, [fromLink]);

  const preview = useQuery({
    queryKey: ["invitation-preview", link?.gen], // the generation tells two links apart; the token is not in the key
    enabled: !!token,
    gcTime: 0,
    retry: false,
    queryFn: () => unwrap(api.POST("/api/v1/invitations/preview", { body: { token: token as string } })),
  });
  const accept = useMutation({
    gcTime: 0,
    mutationFn: () => unwrap(api.POST("/api/v1/invitations/accept", { body: { token: token as string } })),
    onSuccess: async (res) => {
      clearPendingInvite();
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.replace(`/o/${encodeURIComponent(res.org.slug)}/dashboard`);
    },
    onError: () => {
      clearPendingInvite(); // any error ends the stored token; the person opens the link again to retry
    },
  });
  useEffect(() => {
    if (preview.isError) clearPendingInvite();
  }, [preview.isError]);

  if (token === undefined || (!!token && preview.isLoading)) return <LoadingPanel rows={4} />;
  if (!token || preview.isError || !preview.data) {
    return (
      <div className="state-box error" style={{ padding: 0, alignItems: "flex-start", textAlign: "left" }}>
        <IconAlert className="big" />
        <h2>This invite link no longer works</h2>
        <p>It expired, was already used, or is incomplete. Ask your workspace admin for a new link.</p>
        <Link className="btn" href="/login">Go to sign in</Link>
      </div>
    );
  }
  const inv = preview.data;
  const expires = new Date(inv.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return (
    <>
      <h2>Join {inv.org_name}</h2>
      <p className="muted">
        You were invited as <b>{inv.email_masked}</b> to join as <b>{ROLE_NAMES[inv.role]}</b>. The link expires on {expires}.
      </p>
      <div className="stack" style={{ marginTop: 24 }}>
        {accept.isError ? (
          <Banner kind="error">
            {isApiError(accept.error, "email_mismatch")
              ? `You are signed in as ${me?.user.email ?? "another account"}. Sign in with the invited email, then open the invite link again.`
              : isApiError(accept.error, "already_member")
                ? "You are already a member of this workspace."
                : "Could not accept the invitation. Open the invite link again to retry."}
          </Banner>
        ) : null}
        {status === "authenticated" ? (
          <Button variant="primary" onClick={() => accept.mutate()} disabled={accept.isPending || accept.isError}>
            {accept.isPending ? <Spinner /> : null}
            Accept and continue
          </Button>
        ) : (
          <>
            <Banner kind="info">Sign in or create an account with the invited email to accept.</Banner>
            <Link className="btn primary" href="/login">Sign in to accept</Link>
            <Link className="btn" href="/register">Create an account</Link>
          </>
        )}
      </div>
    </>
  );
}
