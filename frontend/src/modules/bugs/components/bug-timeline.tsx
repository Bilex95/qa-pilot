"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { IconChevron } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button, DANGER_FILL, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { useOrg } from "@/modules/shell/org-context";

import { useActivity, useComments, useRefreshBug, type BugActivity, type BugComment, type BugDetail } from "../detail-hooks";
import { COMMENT_MAX, checkComment, timeAgo } from "../schemas";
import { ActivityText } from "./activity-text";

type Entry =
  | { kind: "comment"; at: string; id: string; comment: BugComment }
  | { kind: "event"; at: string; id: string; event: BugActivity };

/**
 * The comment thread and the activity timeline of one bug (API-069 to API-072 and API-077; REQ-023, REQ-025), newest first.
 * "Comments only" hides the events. Every role may comment (D-007); people edit and delete their own comments, and an Org Admin
 * deletes any.
 */
export function BugTimeline({ bug }: { bug: BugDetail }) {
  const org = useOrg();
  const { me } = useSession();
  const toast = useToast();
  const refresh = useRefreshBug();
  const comments = useComments(bug.id);
  const activity = useActivity(bug.id);
  const [tab, setTab] = useState<"all" | "comments">("all");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ id: string; body: string; error?: string } | null>(null);
  const [deleting, setDeleting] = useState<BugComment | null>(null);

  const post = useMutation({
    mutationFn: (body: string) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/bugs/{bug_id}/comments", { params: { path: { org_id: org.id, bug_id: bug.id } }, body: { body } })),
    onSuccess: () => {
      setDraft("");
      toast("Comment posted");
      refresh(bug.id, { comments: true });
    },
    onError: (err) => {
      if (isApiError(err, "validation_error")) setDraftError(err.fieldErrors().body ?? "Write between 1 and 5,000 characters.");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast("Could not post the comment. Check your connection and try again.", "error");
    },
  });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/comments/{comment_id}", { params: { path: { org_id: org.id, comment_id: id } }, body: { body } })),
    onSuccess: () => {
      setEditing(null);
      toast("Comment saved");
      refresh(bug.id, { comments: true, activity: false, bug: false });
    },
    onError: (err) => {
      if (isApiError(err, "validation_error")) setEditing((e) => (e ? { ...e, error: err.fieldErrors().body ?? "Write between 1 and 5,000 characters." } : e));
      else if (isApiError(err, "forbidden")) toast("You can only edit your own comments.", "error");
      else if (isApiError(err, "not_found")) { setEditing(null); toast("That comment was deleted.", "error"); refresh(bug.id, { comments: true, bug: true }); }
      else toast("Could not save the comment. Try again.", "error");
    },
  });

  const remove = useMutation({
    mutationFn: (c: BugComment) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/comments/{comment_id}", { params: { path: { org_id: org.id, comment_id: c.id } } })),
    onSuccess: () => {
      setDeleting(null);
      toast("Comment deleted");
      refresh(bug.id, { comments: true });
    },
    onError: (err) => {
      setDeleting(null);
      if (isApiError(err, "forbidden")) toast("You can only delete your own comments.", "error");
      else if (isApiError(err, "not_found")) refresh(bug.id, { comments: true });
      else toast("Could not delete the comment. Try again.", "error");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (post.isPending) return;
    const problem = checkComment(draft);
    setDraftError(problem ?? undefined);
    if (!problem) post.mutate(draft.trim());
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || save.isPending) return;
    const problem = checkComment(editing.body);
    if (problem) setEditing({ ...editing, error: problem });
    else save.mutate({ id: editing.id, body: editing.body.trim() });
  }

  const loading = comments.isPending || (tab === "all" && activity.isPending);
  const failed = comments.isError || (tab === "all" && activity.isError);
  const entries: Entry[] = [
    ...(comments.data?.pages.flatMap((p) => p.items) ?? []).map((c): Entry => ({ kind: "comment", at: c.created_at, id: c.id, comment: c })),
    // A "commented" entry is the comment itself, which is shown in full above: the event list skips it
    ...(tab === "all" ? (activity.data?.pages.flatMap((p) => p.items) ?? []).filter((a) => a.kind !== "commented")
      .map((a): Entry => ({ kind: "event", at: a.created_at, id: a.id, event: a })) : []),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const more = (comments.hasNextPage ?? false) || (tab === "all" && (activity.hasNextPage ?? false));
  const loadingMore = comments.isFetchingNextPage || activity.isFetchingNextPage;
  const total = comments.data?.pages[0]?.total ?? bug.comment_count;
  const canDeleteAny = org.role === "org_admin";

  return (
    <>
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" type="button" aria-selected={tab === "all"} onClick={() => setTab("all")}>Comments and activity</button>
        <button className="tab" role="tab" type="button" aria-selected={tab === "comments"} onClick={() => setTab("comments")}>
          Comments only{total ? ` (${total})` : ""}
        </button>
      </div>
      {loading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div aria-hidden="true">
            {[80, 60, 90].map((w, i) => <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />)}
          </div>
        </div>
      ) : failed ? (
        <div className="state-box error" role="alert" style={{ padding: "var(--sp-6)" }}>
          <h2>Could not load the {tab === "all" ? "timeline" : "comments"}</h2>
          <Button variant="primary" onClick={() => { void comments.refetch(); void activity.refetch(); }}>Try again</Button>
        </div>
      ) : entries.length === 0 ? (
        <p className="small muted">{tab === "all" ? "Nothing has happened on this bug yet." : "No comments yet. Start the conversation below."}</p>
      ) : (
        <ul className="timeline" aria-label={tab === "all" ? "Comments and activity" : "Comments"}>
          {entries.map((e) => {
            if (e.kind === "event") {
              const a = e.event;
              return (
                <li key={`e-${a.id}`}>
                  <span className="event-dot"><IconChevron style={{ transform: "rotate(-90deg)" }} /></span>
                  <div className="small" style={{ overflowWrap: "anywhere" }}>
                    <b>{a.actor_name}</b> <ActivityText entry={a} />{" "}
                    <span className="muted" title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span>
                  </div>
                </li>
              );
            }
            const c = e.comment;
            const mine = c.author_id === me?.user.id;
            const isEditing = editing?.id === c.id;
            return (
              <li key={`c-${c.id}`} data-comment-id={c.id}>
                <Avatar id={c.author_id} name={c.author_name} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div className="small">
                    <b style={{ overflowWrap: "anywhere" }}>{c.author_name}</b>{" "}
                    <span className="muted" title={new Date(c.created_at).toLocaleString()}>{timeAgo(c.created_at)}</span>
                    {c.edited_at ? <span className="muted" title={new Date(c.edited_at).toLocaleString()}> (edited)</span> : null}
                  </div>
                  {isEditing ? (
                    <form onSubmit={saveEdit} className="stack" style={{ marginTop: 6 }} noValidate>
                      <Field id={`c-edit-${c.id}`} label={<span className="sr-only">Edit your comment</span>} error={editing.error}
                        hint={`${editing.body.length} of ${COMMENT_MAX} characters`}>
                        {(aria) => (
                          <Textarea {...aria} value={editing.body} autoFocus
                            onChange={(ev) => setEditing({ id: c.id, body: ev.target.value })} />
                        )}
                      </Field>
                      <div className="row">
                        <Button variant="primary" size="sm" type="submit" disabled={save.isPending}>
                          {save.isPending ? <Spinner /> : null}
                          Save
                        </Button>
                        <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="comment-body" style={{ overflowWrap: "anywhere" }}>{c.body}</div>
                      {mine || canDeleteAny ? (
                        <div className="row" style={{ gap: 4, marginTop: 2 }}>
                          {mine ? <Button variant="ghost" size="sm" onClick={() => setEditing({ id: c.id, body: c.body })}>Edit</Button> : null}
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}>Delete</Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {more ? (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" disabled={loadingMore}
            onClick={() => { if (comments.hasNextPage) void comments.fetchNextPage(); if (tab === "all" && activity.hasNextPage) void activity.fetchNextPage(); }}>
            {loadingMore ? <Spinner /> : null}
            Show older
          </Button>
        </div>
      ) : null}
      {can(org.role, "comment.create") ? (
        <form onSubmit={submit} className="stack" style={{ marginTop: 16 }} noValidate>
          <Field id="c-body" label="Add a comment" error={draftError} hint={`Plain text. ${draft.length} of ${COMMENT_MAX} characters.`}>
            {(aria) => (
              <Textarea {...aria} value={draft} placeholder="Ask a question or share findings. Plain text."
                onChange={(ev) => { setDraft(ev.target.value); if (draftError) setDraftError(undefined); }} />
            )}
          </Field>
          <div>
            <Button variant="primary" type="submit" disabled={post.isPending}>
              {post.isPending ? <Spinner /> : null}
              Post comment
            </Button>
          </div>
        </form>
      ) : null}
      {deleting ? (
        <Dialog
          title="Delete this comment?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="primary" style={DANGER_FILL} disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>
                {remove.isPending ? <Spinner /> : null}
                Delete comment
              </Button>
            </>
          }
        >
          <div className="modal-body">
            <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-line" }}>{deleting.body.length > 200 ? `${deleting.body.slice(0, 200)}...` : deleting.body}</p>
            <p className="small muted">{deleting.author_id === me?.user.id ? "Your comment" : `The comment of ${deleting.author_name}`} is removed from {bug.key}. This cannot be undone.</p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
