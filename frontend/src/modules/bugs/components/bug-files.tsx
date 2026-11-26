"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { IconX } from "@/components/icons";
import { Button, DANGER_FILL, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { useOrg } from "@/modules/shell/org-context";

import { useFiles, useRefreshBug, type BugDetail, type BugFile } from "../detail-hooks";
import { ALLOWED_EXTENSIONS, MAX_FILES, MAX_FILE_MB, checkFile, fileSize } from "../files";

/**
 * Attachments of a bug (API-073 to API-076; REQ-024, D-009). The type, size and count are checked here for a quick answer and
 * again by the API, whose answer wins. A file is downloaded through the authenticated endpoint, never from a public address.
 */
export function BugFiles({ bug }: { bug: BugDetail }) {
  const org = useOrg();
  const { me } = useSession();
  const toast = useToast();
  const refresh = useRefreshBug();
  const files = useFiles(bug.id);
  const input = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<BugFile | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const list = files.data ?? [];
  const canUpload = can(org.role, "attachment.upload");
  const mayRemove = (f: BugFile) => org.role === "org_admin" || org.role === "qa_lead" || (org.role !== "viewer" && f.uploaded_by_id === me?.user.id);

  const upload = useMutation({
    mutationFn: (file: File) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/bugs/{bug_id}/attachments", {
        params: { path: { org_id: org.id, bug_id: bug.id } },
        body: { file: file as unknown as string },
        bodySerializer: () => { const form = new FormData(); form.append("file", file); return form; },
      })),
    onSuccess: (made) => {
      toast(`${made.filename} attached`);
      refresh(bug.id, { files: true });
    },
    onError: (err) => {
      if (isApiError(err, "unsupported_type")) toast("That file type is not allowed, or the file is not what its name says.", "error");
      else if (isApiError(err, "file_too_large")) toast(`A file can be at most ${MAX_FILE_MB} MB.`, "error");
      else if (isApiError(err, "too_many_files")) toast(`A bug holds at most ${MAX_FILES} files.`, "error");
      else if (isApiError(err, "forbidden")) toast("Your role cannot attach files.", "error");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast("Could not attach the file. Check your connection and try again.", "error");
    },
  });

  const remove = useMutation({
    mutationFn: (file: BugFile) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/attachments/{attachment_id}", { params: { path: { org_id: org.id, attachment_id: file.id } } })),
    onSuccess: (_, file) => {
      toast(`${file.filename} removed`);
      setRemoving(null);
      refresh(bug.id, { files: true });
    },
    onError: (err) => {
      setRemoving(null);
      if (isApiError(err, "forbidden")) toast("You can only remove files you uploaded.", "error");
      else if (isApiError(err, "not_found")) refresh(bug.id, { files: true });
      else toast("Could not remove the file. Try again.", "error");
    },
  });

  function choose(selected: FileList | null) {
    const file = selected?.[0];
    if (input.current) input.current.value = ""; // choosing the same file again must still fire a change
    if (!file) return;
    const problem = checkFile(file, list.length);
    if (problem) toast(problem, "error");
    else upload.mutate(file);
  }

  async function download(file: BugFile) {
    setDownloading(file.id);
    try {
      const { data, response, error } = await api.GET("/api/v1/orgs/{org_id}/attachments/{attachment_id}/download", {
        params: { path: { org_id: org.id, attachment_id: file.id } }, parseAs: "blob",
      });
      if (error !== undefined || !response.ok || !data) throw new Error("download failed");
      const url = URL.createObjectURL(data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast(`Could not download ${file.filename}. Try again.`, "error");
      refresh(bug.id, { files: true, bug: false, activity: false });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <h2 style={{ fontSize: "var(--fs-lg)" }}>Attachments</h2>
      <div className="files" aria-busy={files.isPending || upload.isPending}>
        {files.isError ? <span className="small muted">Could not load the attachments.</span> : null}
        {list.map((f) => (
          <span key={f.id} className="file" style={{ maxWidth: "100%", minWidth: 0, padding: 0, gap: 0 }}>
            <Button variant="ghost" size="sm" disabled={downloading === f.id} aria-label={`Download ${f.filename}`}
              title={`${f.filename}, uploaded by ${f.uploaded_by_name}`}
              style={{ minWidth: 0, maxWidth: "100%", height: "auto", whiteSpace: "normal", textAlign: "left", padding: "6px 10px" }}
              onClick={() => void download(f)}>
              {downloading === f.id ? <Spinner /> : null}
              <span style={{ overflowWrap: "anywhere", textAlign: "left" }}>{f.filename}</span>
              <span className="muted xs">{fileSize(f.size_bytes)}</span>
            </Button>
            {mayRemove(f) ? (
              <Button variant="ghost" size="icon" aria-label={`Remove ${f.filename}`} onClick={() => setRemoving(f)}>
                <IconX />
              </Button>
            ) : null}
          </span>
        ))}
        {!files.isPending && !files.isError && list.length === 0 ? <span className="small muted">No files attached.</span> : null}
        {canUpload ? (
          <>
            <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" id="bug-file-input"
              accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")} onChange={(e) => choose(e.target.files)} />
            <Button size="sm" disabled={upload.isPending || list.length >= MAX_FILES} onClick={() => input.current?.click()}
              title={list.length >= MAX_FILES ? `A bug holds at most ${MAX_FILES} files` : undefined}>
              {upload.isPending ? <Spinner /> : <ClipIcon />}
              Attach file
            </Button>
          </>
        ) : null}
      </div>
      {canUpload ? (
        <p className="hint" style={{ marginTop: 8 }}>
          Up to {MAX_FILES} files of {MAX_FILE_MB} MB: images, PDF, text, logs, JSON, CSV, ZIP and short videos.
        </p>
      ) : null}
      {removing ? (
        <Dialog
          title="Remove this file?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button variant="primary" style={DANGER_FILL} disabled={remove.isPending} onClick={() => remove.mutate(removing)}>
                {remove.isPending ? <Spinner /> : null}
                Remove file
              </Button>
            </>
          }
        >
          <div className="modal-body">
            <p style={{ overflowWrap: "anywhere" }}>{removing.filename}</p>
            <p className="small muted">The file is deleted from {bug.key}. This cannot be undone.</p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.7 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
    </svg>
  );
}
