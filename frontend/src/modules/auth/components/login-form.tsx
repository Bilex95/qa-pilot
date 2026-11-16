"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { isApiError } from "@/lib/api/errors";
import { homeFor, useSession } from "@/lib/session/session-provider";
import { safeNext } from "@/lib/utils";

import { loginSchema, zodErrors, type FieldErrors } from "../schemas";

/** SCR-01 Login (REQ-002, REQ-010). */
export function LoginForm() {
  const { login } = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = loginSchema.safeParse(data);
    setFormError(null);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const me = await login(parsed.data.email, parsed.data.password);
      router.replace(homeFor(me, next));
    } catch (err) {
      setPending(false);
      if (isApiError(err, "invalid_credentials")) setFormError("Email or password is incorrect. Check both and try again.");
      else if (isApiError(err, "rate_limited")) setFormError("Too many failed attempts. Wait 15 minutes, then try again.");
      else if (isApiError(err)) setFormError(err.message);
      else setFormError("The server did not respond. Check your connection and try again.");
    }
  }

  return (
    <>
      <h2>Sign in</h2>
      <p className="muted">Welcome back. Sign in to your workspace.</p>
      <form onSubmit={onSubmit} noValidate aria-busy={pending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <Field id="l-email" label="Email" error={errors.email}>
          {(a) => <Input {...a} name="email" type="email" autoComplete="email" disabled={pending} />}
        </Field>
        <Field id="l-pass" label="Password" error={errors.password}>
          {(a) => <Input {...a} name="password" type="password" autoComplete="current-password" disabled={pending} />}
        </Field>
        <Button type="submit" variant="primary" aria-disabled={pending} disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Signing in
            </>
          ) : (
            "Sign in"
          )}
        </Button>
        <p className="small muted">
          New to QA Pilot? <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}>Create an account</Link>
        </p>
      </form>
    </>
  );
}
