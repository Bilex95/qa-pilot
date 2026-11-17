"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { IconAlert } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Banner, LoadingPanel } from "@/components/ui/feedback";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ROLE_NAMES } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";

/** SCR-04 Accept invitation (REQ-006, D-011). */
export function InviteAccept({ token }: { token: string }) {
  const { status, me } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => unwrap(api.GET("/api/v1/invitations/{token}", { params: { path: { token } } })),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/invitations/{token}/accept", { params: { path: { token } } })),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.replace(`/o/${res.org.slug}/dashboard`);
    },
  });

  if (preview.isLoading) return <LoadingPanel rows={4} />;
  if (preview.isError || !preview.data) {
    return (
      <div className="state-box error" style={{ padding: 0, alignItems: "flex-start", textAlign: "left" }}>
        <IconAlert className="big" />
        <h2>This invite link no longer works</h2>
        <p>It expired or was already used. Ask your workspace admin for a new link.</p>
        <Link className="btn" href="/login">Go to sign in</Link>
      </div>
    );
  }
  const inv = preview.data;
  const expires = new Date(inv.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  const back = `/invite/${encodeURIComponent(token)}`;
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
              ? `You are signed in as ${me?.user.email ?? "another account"}. Sign in with the invited email to accept.`
              : isApiError(accept.error, "already_member")
                ? "You are already a member of this workspace."
                : "Could not accept the invitation. Try again."}
          </Banner>
        ) : null}
        {status === "authenticated" ? (
          <Button variant="primary" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? <Spinner /> : null}
            Accept and continue
          </Button>
        ) : (
          <>
            <Banner kind="info">Sign in or create an account with the invited email to accept.</Banner>
            <Link className="btn primary" href={`/login?next=${encodeURIComponent(back)}`}>Sign in to accept</Link>
            <Link className="btn" href={`/register?next=${encodeURIComponent(back)}`}>Create an account</Link>
          </>
        )}
      </div>
    </>
  );
}
