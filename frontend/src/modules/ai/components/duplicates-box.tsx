"use client";

import Link from "next/link";

import { IconAlert } from "@/components/icons";
import { StatusBadge } from "@/modules/bugs/components/bug-badges";
import { useAiEnabled, useOrg } from "@/modules/shell/org-context";

import { useDebounced, useDuplicates } from "../hooks";

const MIN_TITLE = 8;
const WAIT_MS = 600;

/**
 * "This may be a duplicate" (REQ-046, AI_SPEC 3.4): open bugs of the project that read like the title being typed. It asks the server 600 ms
 * after the typing stops and only for a title of 8 characters or more; no model is involved, so it costs nothing. It shows nothing when
 * AI is off, when nothing is similar, or when the call fails (a missing warning is better than a broken form).
 */
export function DuplicatesBox({ projectId, projectName, title, actualResult }: { projectId: string; projectName: string; title: string; actualResult: string }) {
  const org = useOrg();
  const aiOn = useAiEnabled();
  const settledTitle = useDebounced(title.trim(), WAIT_MS);
  const settledActual = useDebounced(actualResult, WAIT_MS);
  const enabled = aiOn && title.trim().length >= MIN_TITLE && settledTitle.length >= MIN_TITLE;
  const found = useDuplicates({ projectId, title: settledTitle, actualResult: settledActual }, enabled);
  const candidates = enabled ? found.data?.candidates ?? [] : [];
  if (candidates.length === 0) return null;
  return (
    <div className="dupes" role="status">
      <h3><IconAlert width={18} height={18} />This may be a duplicate</h3>
      <p className="small muted" style={{ margin: "4px 0 8px" }}>Open bugs in {projectName} with similar wording. Check them before saving.</p>
      {candidates.map((c) => (
        <div key={c.bug.id} className="dupe">
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <span className="mono muted" style={{ fontSize: 13 }}>{c.bug.key}</span>{" "}
            <Link href={`/o/${org.slug}/bugs/${c.bug.key}`} target="_blank" rel="noreferrer">{c.bug.title}</Link>{" "}
            <StatusBadge status={c.bug.status} />
          </div>
          <span className="score">
            <span className="score-bar"><i style={{ width: `${Math.round(c.score * 100)}%` }} /></span>
            {Math.round(c.score * 100)}% similar
          </span>
        </div>
      ))}
    </div>
  );
}
