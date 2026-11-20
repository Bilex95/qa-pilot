import { SEVERITY_NAME, SLA_TEXT, STATUS_NAME } from "../schemas";

/** Badges from the locked design: colour plus text, never colour alone (REQ-021). */
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge st st-${status}`}>{STATUS_NAME[status] ?? status}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`badge sev-${severity}`}>
      <span className="dot" />
      {SEVERITY_NAME[severity] ?? severity}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: string }) {
  return <span className={`pri ${priority}`} title={`Priority ${priority.toUpperCase()}`}>{priority.toUpperCase()}</span>;
}

export function SlaBadge({ severity }: { severity: string }) {
  return (
    <span className="badge sla"
      title={`Not fixed within ${SLA_TEXT[severity] ?? "its limit"} of being reported (SLA for ${SEVERITY_NAME[severity] ?? severity} bugs)`}>
      Past SLA
    </span>
  );
}
