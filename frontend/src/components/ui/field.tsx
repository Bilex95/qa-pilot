import type { ComponentProps, ReactNode } from "react";

import { IconAlert } from "@/components/icons";
import { cn } from "@/lib/utils";

type FieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  labelAside?: ReactNode;
  children: (aria: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

/** Label, control, hint and error wired together for screen readers (NFR accessibility). */
export function Field({ id, label, error, hint, labelAside, children }: FieldProps) {
  const describedBy = [hint ? `${id}-h` : null, error ? `${id}-e` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("field", error && "invalid")}>
      {labelAside ? (
        <div className="row between">
          <label htmlFor={id} className="label">{label}</label>
          {labelAside}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint ? <div className="hint" id={`${id}-h`}>{hint}</div> : null}
      {error ? (
        <div className="err" id={`${id}-e`}>
          <IconAlert width={16} height={16} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("input", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn("select", className)} {...props} />;
}
