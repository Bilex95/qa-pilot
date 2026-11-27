"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { IconAlert, IconCheck } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Banner, LoadingPanel } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { forgetFragmentToken, useFragmentLink } from "@/lib/secret-link";

import { passwordPolicy, type FieldErrors } from "../schemas";

/**
 * Set a new password with a reset link (API-152, API-153; D-045, D-055). The link is `/reset-password#<token>`: the token is
 * read from the fragment once, removed from the address bar, kept in memory only (a refresh loses it, the person opens the
 * link again) and sent only in request bodies. When the password is set the token is forgotten.
 */
export function ResetPasswordForm() {
  const link = useFragmentLink(); // undefined on the server and during hydration, then the link read from the fragment
  const fromLink = link?.value; // the token, null when there is none, undefined before it was read
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [goneToken, setGoneToken] = useState<string | null>(null);
  const token = fromLink; // memory only: nothing of it is stored
  const gone = !!token && goneToken === token; // refused on submit: a different link opened later gets its own chance
  const preview = useQuery({
    queryKey: ["reset-preview", link?.gen], // the generation tells two links apart; the token itself is not in the key
    enabled: !!token && !done,
    gcTime: 0,
    retry: false,
    queryFn: () => unwrap(api.POST("/api/v1/auth/password-reset/preview", { body: { token: token as string } })),
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || pending) return;
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const found: FieldErrors = {};
    const policy = passwordPolicy.safeParse(data.new_password ?? "");
    if (!policy.success) found.new_password = policy.error.issues[0]?.message;
    if ((data.confirm_password ?? "") !== (data.new_password ?? "")) found.confirm_password = "The two passwords do not match.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await unwrap(api.POST("/api/v1/auth/password-reset/confirm", { body: { token, new_password: data.new_password ?? "" } }));
      forgetFragmentToken();
      setDone(true);
    } catch (err) {
      setPending(false);
      if (isApiError(err, "reset_invalid")) {
        forgetFragmentToken();
        setGoneToken(token);
      } else if (isApiError(err, "rate_limited")) setFormError("Too many attempts. Wait 15 minutes, then open the link again.");
      else if (isApiError(err) && err.fieldErrors().new_password) setErrors({ new_password: err.fieldErrors().new_password });
      else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
    }
  }

  if (done) {
    return (
      <>
        <h2>Password changed</h2>
        <div className="stack" style={{ marginTop: 16 }}>
          <Banner kind="ok">Your new password is set and every other device was signed out. Sign in with it now.</Banner>
          <Link className="btn primary" href="/login">Sign in</Link>
        </div>
      </>
    );
  }
  if (token === undefined || (!!token && preview.isLoading && !gone)) return <LoadingPanel rows={4} />;
  if (!token || gone || preview.isError || !preview.data) {
    return (
      <div className="state-box error" style={{ padding: 0, alignItems: "flex-start", textAlign: "left" }}>
        <IconAlert className="big" />
        <h2>This reset link no longer works</h2>
        <p>It expired, was already used, or is incomplete. Ask a workspace admin for a new link.</p>
        <Link className="btn" href="/forgot-password">How to get a new link</Link>
      </div>
    );
  }
  return (
    <>
      <h2>Set a new password</h2>
      <p className="muted">For <b>{preview.data.email_masked}</b>. You will be signed out on every other device.</p>
      <form onSubmit={onSubmit} noValidate aria-busy={pending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <Field id="rp-new" label="New password" error={errors.new_password} hint="At least 10 characters with a letter and a number.">
          {(a) => <Input {...a} name="new_password" type="password" autoComplete="new-password" disabled={pending} />}
        </Field>
        <Field id="rp-confirm" label="Confirm new password" error={errors.confirm_password}>
          {(a) => <Input {...a} name="confirm_password" type="password" autoComplete="new-password" disabled={pending} />}
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Setting password
            </>
          ) : (
            <>
              <IconCheck />
              Set password
            </>
          )}
        </Button>
      </form>
    </>
  );
}
