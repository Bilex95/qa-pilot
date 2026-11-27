"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Banner, ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/session/session-provider";
import { useOrg } from "@/modules/shell/org-context";

import { dailyLimitSchema, orgNameSchema } from "../schemas";

type OrgDetail = Schemas["OrgWithRoleOut"];
type Update = Schemas["OrgUpdateIn"];

function useOrgDetail() {
  const org = useOrg();
  return useQuery({
    queryKey: ["org", org.id],
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}", { params: { path: { org_id: org.id } } })),
  });
}

function useSaveOrg(onSaved: (message: string) => void) {
  const org = useOrg();
  const qc = useQueryClient();
  const { reloadMe } = useSession();
  return useMutation({
    mutationFn: (body: Update) => unwrap(api.PATCH("/api/v1/orgs/{org_id}", { params: { path: { org_id: org.id } }, body })),
    onSuccess: async (saved) => {
      qc.setQueryData(["org", org.id], (old: OrgDetail | undefined) => (old ? { ...old, ...saved } : old));
      await reloadMe(); // the workspace name and the AI switch come from /auth/me: the shell and every AI control follow
      onSaved("saved");
    },
  });
}

/** SCR-20 Organization tab (API-022, API-023; REQ-011, D-027). Only an Org Admin sees it. */
export function OrganizationTab() {
  const detail = useOrgDetail();
  if (detail.isLoading) return <LoadingPanel rows={5} />;
  if (detail.isError || !detail.data) {
    return <ErrorState what="the workspace settings" onRetry={() => void detail.refetch()} requestId={isApiError(detail.error) ? detail.error.requestId : undefined} />;
  }
  const d = detail.data;
  // The forms start from what the server holds; a save changes the data, which remounts them with the saved values
  return (
    <div className="grid g2" style={{ alignItems: "start" }} key={`${d.name}|${d.ai_enabled}|${d.ai_daily_limit}`}>
      <WorkspacePanel org={d} />
      <AiPanel org={d} />
    </div>
  );
}

function WorkspacePanel({ org }: { org: OrgDetail }) {
  const toast = useToast();
  const [name, setName] = useState(org.name);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const save = useSaveOrg(() => toast("Settings saved"));
  const changed = name.trim() !== org.name;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = orgNameSchema.safeParse(name);
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (!parsed.success) return;
    if (!changed) { toast("Nothing to change."); return; }
    save.mutate({ name: parsed.data }, {
      onError: (err) => {
        if (isApiError(err) && err.fieldErrors().name) setError(err.fieldErrors().name);
        else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
      },
    });
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Workspace</h2></div>
      <form className="panel-body stack" onSubmit={onSubmit} noValidate aria-busy={save.isPending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <Field id="s-name" label="Organization name" error={error}>
          {(a) => <Input {...a} value={name} maxLength={80} autoComplete="off" disabled={save.isPending} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field id="s-slug" label="Workspace address" hint="The address cannot be changed after setup.">
          {(a) => <Input {...a} className="mono" value={org.slug} disabled readOnly />}
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? <><Spinner />Saving</> : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function AiPanel({ org }: { org: OrgDetail }) {
  const toast = useToast();
  const [on, setOn] = useState(org.ai_enabled);
  const [limit, setLimit] = useState(String(org.ai_daily_limit)); // kept while AI is off: the field is disabled, not cleared
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const save = useSaveOrg(() => toast("AI settings saved"));
  const limitChanged = on && limit.trim() !== String(org.ai_daily_limit);
  const changed = on !== org.ai_enabled || limitChanged;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const body: Update = { ai_enabled: on };
    if (on) {
      const parsed = dailyLimitSchema.safeParse(limit);
      setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
      if (!parsed.success) return;
      body.ai_daily_limit = Number(parsed.data);
    } else {
      setError(undefined); // the stored limit stays as it is while AI is off
    }
    if (!changed) { toast("Nothing to change."); return; }
    save.mutate(body, {
      onError: (err) => {
        if (isApiError(err) && err.fieldErrors().ai_daily_limit) setError(err.fieldErrors().ai_daily_limit);
        else setFormError(isApiError(err) ? err.message : "The server did not respond. Check your connection and try again.");
      },
    });
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>AI features</h2></div>
      <form className="panel-body stack" onSubmit={onSubmit} noValidate aria-busy={save.isPending}>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
          <label className="switch">
            <input type="checkbox" id="s-ai" checked={on} aria-describedby="s-ai-h" disabled={save.isPending}
              onChange={(e) => setOn(e.target.checked)} />
            <span />
          </label>
          <div>
            <label htmlFor="s-ai" className="label">Use AI features in this workspace</label>
            <p className="hint" id="s-ai-h">
              Bug Writer, triage, duplicate check, test case generator and release summaries. When off, AI buttons are hidden for everyone.
            </p>
          </div>
        </div>
        <Field id="s-lim" label="Daily AI request limit for the workspace" error={error}
          hint={on ? "Each person can also make up to 20 requests per minute." : "AI is off, so the limit is paused. Its value is kept for when you turn AI on again."}>
          {(a) => (
            <Input {...a} type="text" inputMode="numeric" value={limit} style={{ maxWidth: 160 }} autoComplete="off"
              disabled={!on || save.isPending} onChange={(e) => setLimit(e.target.value)} />
          )}
        </Field>
        <Banner kind="info">
          The model is chosen in the server environment (AI_PROVIDER). Prompt text is never stored.
        </Banner>
        <div>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? <><Spinner />Saving</> : "Save AI settings"}
          </Button>
        </div>
      </form>
    </section>
  );
}
