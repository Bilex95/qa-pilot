"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { orgSetupSchema, slugify, zodErrors, type FieldErrors } from "@/modules/auth/schemas";

/** SCR-03 Org setup (REQ-004, D-021): creates the workspace; the creator becomes Org Admin. */
export function OrgSetupForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = orgSetupSchema.safeParse({ name, slug });
    setFormError(null);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const created = await unwrap(api.POST("/api/v1/orgs", { body: parsed.data }));
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.replace(`/o/${created.org.slug}/dashboard`);
    } catch (err) {
      setPending(false);
      if (isApiError(err, "slug_taken")) setErrors({ slug: `This address is taken. Try ${parsed.data.slug}-team.` });
      else if (isApiError(err) && err.status === 422) setErrors(err.fieldErrors());
      else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
    }
  }

  return (
    <>
      <h2>Set up your workspace</h2>
      <p className="muted">A workspace holds your projects, bugs and tests. You will be its Org Admin.</p>
      <form onSubmit={onSubmit} noValidate aria-busy={pending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <Field id="o-name" label="Organization name" error={errors.name}>
          {(a) => (
            <Input {...a} value={name} disabled={pending} autoComplete="organization"
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }} />
          )}
        </Field>
        <Field id="o-slug" label="Workspace address" error={errors.slug}
          hint={errors.slug ? undefined : "Lowercase letters, numbers and hyphens."}>
          {(a) => (
            <div className="row" style={{ flexWrap: "nowrap", gap: 0 }}>
              <span className="input" style={{ width: "auto", borderRight: 0, borderRadius: "4px 0 0 4px", background: "var(--surface-sunk)", color: "var(--ink-3)" }}>
                qapilot.app/o/
              </span>
              <Input {...a} value={slug} disabled={pending} style={{ borderRadius: "0 4px 4px 0" }}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }} />
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Creating workspace
            </>
          ) : (
            "Create workspace"
          )}
        </Button>
        <p className="small muted">Waiting for an invite? Ask your admin for the invite link.</p>
      </form>
    </>
  );
}
