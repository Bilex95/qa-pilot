"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { IconCheck, IconCopy } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Banner } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ROLE_NAMES, type Role } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { inviteSchema, ROLE_ORDER } from "../schemas";

/**
 * Invite people (API-027). The invite link is a secret: it lives only in this component's state, is never logged,
 * put in a URL or stored in a cache that survives the dialog, and is dropped when the dialog closes.
 */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("developer");
  const [errors, setErrors] = useState<{ email?: string; form?: string }>({});
  const [link, setLink] = useState<string | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);

  const create = useMutation({
    gcTime: 0, // nothing of the response (the link) stays in the mutation cache once this dialog is gone
    mutationFn: (body: { email: string; role: Role }) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/invitations", { params: { path: { org_id: org.id } }, body })),
    onSuccess: async (res) => {
      setLink(res.invite_url);
      await qc.invalidateQueries({ queryKey: ["invitations", org.id] });
    },
    onError: (err) => {
      if (isApiError(err, "already_member")) setErrors({ email: err.message });
      else if (isApiError(err) && err.fieldErrors().email) setErrors({ email: err.fieldErrors().email });
      else setErrors({ form: "Could not create the invitation. Try again." });
    },
  });

  // Move focus to Copy once the link appears (the email field is read only by then)
  useEffect(() => {
    if (link) copyButton.current?.focus();
  }, [link]);

  function close() {
    setLink(null); // the secret leaves state before the dialog goes away
    create.reset();
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending || link) return;
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues.find((i) => i.path[0] === "email")?.message ?? "Check the details and try again." });
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      // Clipboard blocked or unavailable: select the text so the person can copy it by hand
      linkInput.current?.focus();
      linkInput.current?.select();
      toast("Could not copy automatically. The link is selected: press Ctrl+C.", "error");
    }
  }

  return (
    <Dialog
      title="Invite people"
      onClose={close}
      footer={
        link ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" type="submit" form="invite-form" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : null}
              Create invite link
            </Button>
          </>
        )
      }
    >
      <form id="invite-form" className="modal-body" onSubmit={submit} noValidate>
        <Field id="inv-email" label="Email" error={errors.email}>
          {(aria) => (
            <Input {...aria} type="email" value={email} readOnly={!!link} autoComplete="off" maxLength={254}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({}); }} />
          )}
        </Field>
        <Field id="inv-role" label="Role" hint="You can change the role later.">
          {(aria) => (
            <Select {...aria} value={role} disabled={!!link} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
            </Select>
          )}
        </Field>
        {errors.form ? <Banner kind="error">{errors.form}</Banner> : null}
        {link ? (
          <>
            <div className="banner ok">
              <IconCheck />
              <div>
                Invitation created. Copy the link and send it yourself. It works once and expires in 7 days. This is the
                only time the link is shown.
              </div>
            </div>
            <div className="copy-row">
              <label className="sr-only" htmlFor="inv-link">Invite link</label>
              <input className="input" id="inv-link" ref={linkInput} readOnly value={link} autoComplete="off"
                spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
              <Button ref={copyButton} onClick={() => void copy()}>
                <IconCopy />
                Copy
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </Dialog>
  );
}
