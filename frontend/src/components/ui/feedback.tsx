import type { ComponentType, ReactNode, SVGProps } from "react";

import { IconAlert, IconCheck, IconInfo, IconRefresh } from "@/components/icons";

import { Button } from "./button";

type Kind = "error" | "info" | "warn" | "ok";
const BANNER_ICON: Record<Kind, ComponentType<SVGProps<SVGSVGElement>>> = {
  error: IconAlert,
  info: IconInfo,
  warn: IconAlert,
  ok: IconCheck,
};

export function Banner({ kind, children }: { kind: Kind; children: ReactNode }) {
  const Icon = BANNER_ICON[kind];
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : undefined}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

type StateProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

/** Empty state from the locked design: an invitation to act, not a mood. */
export function EmptyState({ icon: Icon, title, children, action }: StateProps) {
  return (
    <div className="panel">
      <div className="state-box">
        <Icon className="big" />
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
        {action}
      </div>
    </div>
  );
}

export function ErrorState({ what, onRetry, requestId }: { what: string; onRetry?: () => void; requestId?: string }) {
  return (
    <div className="panel">
      <div className="state-box error" role="alert">
        <IconAlert className="big" />
        <h2>Could not load {what}</h2>
        <p>The server did not respond. Check your connection and try again. If it keeps happening, share the request id with your admin.</p>
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            <IconRefresh />
            Try again
          </Button>
        ) : null}
        {requestId ? <div className="err-code">Request id {requestId}</div> : null}
      </div>
    </div>
  );
}

export function LoadingPanel({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="panel panel-body" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="sk sk-line" style={{ width: `${60 + ((i * 17) % 40)}%` }} />
        ))}
      </div>
    </div>
  );
}
