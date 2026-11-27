"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { IconCheck, IconCopy } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Banner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

type Member = Schemas["MemberOut"];

/**
 * Reset password (API-151; D-045, D-055). An Org Admin asks first (the link signs the person out everywhere once it is used),
 * then gets the link once. The link is a secret: it lives only in this component's state, is never logged, put in a URL or
 * stored in a cache that survives the dialog, and is dropped when the dialog closes. Refused for a person who belongs to
 * more than one workspace (409 shared_account); the button is not shown on your own row.
 */
export function ResetPasswordDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const org = useOrg();
  const toast = useToast();
  const name = member.user.full_name;
  const [link, setLink] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);

  const create = useMutation({
    gcTime: 0, // nothing of the response (the link) stays in the mutation cache once this dialog is gone
    mutationFn: () =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/members/{membership_id}/password-reset", {
        params: { path: { org_id: org.id, membership_id: member.membership_id } },
      })),
    onSuccess: (res) => setLink(res.reset_url),
    onError: (err) => {
      if (isApiError(err, "shared_account")) {
        setProblem(`${name} belongs to more than one workspace, so a workspace admin cannot reset their password. Ask whoever runs this QA Pilot installation for help.`);
      } else if (isApiError(err, "own_account")) setProblem("Change your own password in your profile.");
      else if (isApiError(err, "not_found")) setProblem(`${name} is no longer a member of this workspace.`);
      else setProblem("Could not create the link. Try again.");
    },
  });

  useEffect(() => {
    if (link) copyButton.current?.focus(); // focus moves to Copy once the link appears
  }, [link]);

  function close() {
    setLink(null); // the secret leaves state before the dialog goes away
    create.reset();
    onClose();
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
      title={link ? "Reset link created" : `Reset the password of ${name}?`}
      onClose={close}
      footer={
        link || problem ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner /> : null}
              Create reset link
            </Button>
          </>
        )
      }
    >
      <div className="modal-body">
        {link ? (
          <>
            <div className="banner ok">
              <IconCheck />
              <div>
                Send this link to {name} yourself; no email is sent. It works once and expires in 1 hour. This is the only
                time the link is shown.
              </div>
            </div>
            <div className="copy-row">
              <label className="sr-only" htmlFor="reset-link">Reset link</label>
              <input className="input" id="reset-link" ref={linkInput} readOnly value={link} autoComplete="off" spellCheck={false}
                onFocus={(e) => e.currentTarget.select()} />
              <Button ref={copyButton} onClick={() => void copy()}>
                <IconCopy />
                Copy
              </Button>
            </div>
          </>
        ) : problem ? (
          <Banner kind="error">{problem}</Banner>
        ) : (
          <p style={{ overflowWrap: "anywhere" }}>
            {name} gets a link that sets a new password. When it is used, {name} is signed out on every device. Any earlier
            reset link for {name} stops working.
          </p>
        )}
      </div>
    </Dialog>
  );
}
