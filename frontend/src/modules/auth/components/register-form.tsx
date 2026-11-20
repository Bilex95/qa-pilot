"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { isApiError } from "@/lib/api/errors";
import { hasPendingInvite } from "@/lib/secret-link";
import { homeFor, useSession } from "@/lib/session/session-provider";
import { safeNext } from "@/lib/utils";

import { registerSchema, zodErrors, type FieldErrors } from "../schemas";

/** SCR-02 Register (REQ-001, REQ-010). */
export function RegisterForm() {
  const { register } = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setFormError(null);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const me = await register(parsed.data.full_name, parsed.data.email, parsed.data.password);
      router.replace(hasPendingInvite() ? "/invite" : homeFor(me, next)); // an invitation waiting for the new account (D-055)
    } catch (err) {
      setPending(false);
      if (isApiError(err, "email_taken")) setErrors({ email: "An account with this email already exists." });
      else if (isApiError(err) && err.status === 422) setErrors(err.fieldErrors());
      else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
    }
  }

  return (
    <>
      <h2>Create your account</h2>
      <p className="muted">You will set up or join a workspace next.</p>
      <form onSubmit={onSubmit} noValidate aria-busy={pending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <Field id="r-name" label="Full name" error={errors.full_name}>
          {(a) => <Input {...a} name="full_name" autoComplete="name" disabled={pending} />}
        </Field>
        <Field id="r-email" label="Work email" error={errors.email}>
          {(a) => <Input {...a} name="email" type="email" autoComplete="email" disabled={pending} />}
        </Field>
        <Field id="r-pass" label="Password" error={errors.password} hint="At least 10 characters with a letter and a number.">
          {(a) => <Input {...a} name="password" type="password" autoComplete="new-password" disabled={pending} />}
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Creating account
            </>
          ) : (
            "Create account"
          )}
        </Button>
        <p className="small muted">
          Already have an account? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</Link>
        </p>
      </form>
    </>
  );
}
