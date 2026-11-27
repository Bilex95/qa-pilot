"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button, Spinner } from "@/components/ui/button";
import { Banner, LoadingPanel } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ROLE_NAMES } from "@/lib/permissions";
import { changePassword } from "@/lib/session/change-password";
import { useSession } from "@/lib/session/session-provider";
import { passwordPolicy } from "@/modules/auth/schemas";
import { useOrg } from "@/modules/shell/org-context";

import { fullNameSchema } from "../schemas";

/** SCR-20 My profile tab (API-015, API-016; REQ-010, REQ-011). Every role sees it. */
export function ProfileTab() {
  const { me } = useSession();
  if (!me) return <LoadingPanel rows={5} />;
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <ProfilePanel key={me.user.full_name} user={me.user} />
      <PasswordPanel />
    </div>
  );
}

function ProfilePanel({ user }: { user: Schemas["UserOut"] }) {
  const org = useOrg();
  const toast = useToast();
  const { reloadMe } = useSession();
  const [name, setName] = useState(user.full_name);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (full_name: string) => unwrap(api.PATCH("/api/v1/auth/me", { body: { full_name } })),
    onSuccess: async () => {
      await reloadMe(); // the shell shows the name too
      toast("Profile saved");
    },
    onError: (err) => {
      if (isApiError(err) && err.fieldErrors().full_name) setError(err.fieldErrors().full_name);
      else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
    },
  });
  const changed = name.trim() !== user.full_name;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = fullNameSchema.safeParse(name);
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (!parsed.success) return;
    if (!changed) toast("Nothing to change.");
    else save.mutate(parsed.data);
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Profile</h2></div>
      <form className="panel-body stack" onSubmit={onSubmit} noValidate aria-busy={save.isPending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <div className="row">
          <Avatar id={user.id} name={user.full_name} size={48} />
          <div style={{ minWidth: 0 }}>
            <b>{user.full_name}</b>
            <div className="small muted">{ROLE_NAMES[org.role]} in {org.name}</div>
          </div>
        </div>
        <Field id="p-name" label="Full name" error={error}>
          {(a) => <Input {...a} value={name} maxLength={120} autoComplete="name" disabled={save.isPending} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field id="p-email" label="Email" hint="Email cannot be changed in this version.">
          {(a) => <Input {...a} value={user.email} disabled readOnly />}
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? <><Spinner />Saving</> : "Save profile"}
          </Button>
        </div>
      </form>
    </section>
  );
}

type Errors = Partial<Record<"current" | "next" | "confirm", string>>;

function PasswordPanel() {
  const toast = useToast();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0); // a new key empties the fields after a change

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const found: Errors = {};
    if (!data.current_password) found.current = "Enter your current password.";
    const policy = passwordPolicy.safeParse(data.new_password ?? "");
    if (!policy.success) found.next = policy.error.issues[0]?.message;
    if ((data.confirm_password ?? "") !== (data.new_password ?? "")) found.confirm = "The two passwords do not match.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await changePassword(data.current_password ?? "", data.new_password ?? "");
      setFormKey((k) => k + 1);
      toast("Password changed. Other devices were signed out.");
    } catch (err) {
      if (isApiError(err, "wrong_password")) setErrors({ current: "That is not your current password." });
      else if (isApiError(err) && err.fieldErrors().new_password) setErrors({ next: err.fieldErrors().new_password });
      else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Change password</h2></div>
      <form key={formKey} className="panel-body stack" onSubmit={onSubmit} noValidate aria-busy={pending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <Field id="p-cur" label="Current password" error={errors.current}>
          {(a) => <Input {...a} name="current_password" type="password" autoComplete="current-password" disabled={pending} />}
        </Field>
        <Field id="p-new" label="New password" error={errors.next} hint="At least 10 characters with a letter and a number. Other sessions are signed out.">
          {(a) => <Input {...a} name="new_password" type="password" autoComplete="new-password" disabled={pending} />}
        </Field>
        <Field id="p-confirm" label="Confirm new password" error={errors.confirm}>
          {(a) => <Input {...a} name="confirm_password" type="password" autoComplete="new-password" disabled={pending} />}
        </Field>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <><Spinner />Changing</> : "Change password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
