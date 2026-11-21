"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshReleases } from "../hooks";
import type { Release } from "../releases";

type Pick = { id: string; title: string; sub: string };
const MAX = 100; // the API takes at most 100 links in one request

/** The shared body of Link bugs and Link run: a list of toggle buttons (a 44 px target on touch screens), filtered by what is typed. */
function Picker({ title, noun, items, pending, loading, failed, filter, onFilter, onConfirm, onClose }: {
  title: string;
  noun: string;
  items: Pick[];
  pending: boolean;
  loading: boolean;
  failed: boolean;
  filter?: string;
  onFilter?: (v: string) => void;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending || picked.length === 0} onClick={() => onConfirm(picked)}>
            {pending ? <Spinner /> : null}
            Link {picked.length} {picked.length === 1 ? noun : `${noun}s`}
          </Button>
        </>
      }
    >
      <div className="modal-body stack">
        {onFilter ? (
          <div className="field">
            <label className="sr-only" htmlFor="lk-q">Search</label>
            <Input id="lk-q" value={filter ?? ""} placeholder={`Search ${noun}s by key or title`} autoComplete="off" onChange={(e) => onFilter(e.target.value)} />
          </div>
        ) : null}
        {failed ? <p className="small muted" role="alert">Could not load the list. Close this and try again.</p>
          : loading ? <p className="small muted" role="status">Loading.</p>
          : items.length === 0 ? <p className="small muted">Nothing to link: every {noun} of this project is already in this release.</p>
          : (
            <div className="stack" style={{ gap: 6, maxHeight: "50vh", overflowY: "auto" }} role="group" aria-label={`${noun}s to link`}>
              {items.map((i) => {
                const on = picked.includes(i.id);
                return (
                  <Button key={i.id} variant={on ? "primary" : "default"} aria-pressed={on} disabled={!on && picked.length >= MAX}
                    style={{ justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal", height: "auto", overflowWrap: "anywhere" }}
                    onClick={() => toggle(i.id)}>
                    <span className="mono">{i.sub}</span> {i.title}
                  </Button>
                );
              })}
            </div>
          )}
      </div>
    </Dialog>
  );
}

function useLinkError(releaseName: string) {
  const toast = useToast();
  return (err: unknown) => {
    if (isApiError(err, "validation_error")) toast(err.fieldErrors().bug_ids ?? err.fieldErrors().run_ids ?? "That cannot be linked.", "error");
    else if (isApiError(err, "not_found")) toast(`${releaseName} was deleted by someone else.`, "error");
    else toast("Could not link. Check your connection and try again.", "error");
  };
}

/** Link bugs (API-116): the open bugs of the release's project that are not in it yet. */
export function LinkBugsDialog({ release, onClose }: { release: Release; onClose: () => void }) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshReleases();
  const onError = useLinkError(release.name);
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["bugs", org.id, "release-picker", release.project_id, q],
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs", {
        params: { path: { org_id: org.id }, query: { project_id: release.project_id, open: true, page: 1, page_size: 100, q: q.trim() || undefined, sort: "-updated_at" } },
      })),
  });
  const link = useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/releases/{release_id}/bugs", { params: { path: { org_id: org.id, release_id: release.id } }, body: { bug_ids: ids } })),
    onSuccess: (done) => {
      toast(`${done.linked} ${done.linked === 1 ? "bug" : "bugs"} linked to ${release.name}`);
      refresh();
      onClose();
    },
    onError,
  });
  const items = (list.data?.items ?? []).filter((b) => b.release_id !== release.id).map((b) => ({ id: b.id, title: b.title, sub: b.key }));
  return <Picker title="Link bugs" noun="bug" items={items} pending={link.isPending} loading={list.isPending} failed={list.isError}
    filter={q} onFilter={setQ} onConfirm={(ids) => link.mutate(ids)} onClose={onClose} />;
}

/** Link run (API-118): the runs of the release's project that are not in it yet, completed ones included. */
export function LinkRunsDialog({ release, onClose }: { release: Release; onClose: () => void }) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshReleases();
  const onError = useLinkError(release.name);
  const list = useQuery({
    queryKey: ["test-runs", org.id, "release-picker", release.project_id],
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-runs", {
        params: { path: { org_id: org.id }, query: { project_id: release.project_id, page: 1, page_size: 100 } },
      })),
  });
  const link = useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/releases/{release_id}/runs", { params: { path: { org_id: org.id, release_id: release.id } }, body: { run_ids: ids } })),
    onSuccess: (done) => {
      toast(`${done.linked} ${done.linked === 1 ? "run" : "runs"} linked to ${release.name}`);
      refresh();
      onClose();
    },
    onError,
  });
  const items = (list.data?.items ?? []).filter((r) => r.release_id !== release.id).map((r) => ({ id: r.id, title: r.name, sub: r.key }));
  return <Picker title="Link run" noun="run" items={items} pending={link.isPending} loading={list.isPending} failed={list.isError}
    onConfirm={(ids) => link.mutate(ids)} onClose={onClose} />;
}
