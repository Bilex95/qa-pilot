"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { IconAlert, IconCheck } from "@/components/icons";

type Toast = { id: number; message: string; kind: "ok" | "error" };
type Notify = (message: string, kind?: Toast["kind"]) => void;

const ToastContext = createContext<Notify | null>(null);

/** Toasts from the locked design: bottom centre, dark, gone after 3.2 s; errors use role="alert". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const notify = useCallback<Notify>((message, kind = "ok") => {
    const id = (next.current += 1);
    setToasts((all) => [...all, { id, message, kind }]);
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 3200);
  }, []);
  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`} role={t.kind === "error" ? "alert" : "status"}>
            {t.kind === "error" ? <IconAlert width={16} height={16} /> : <IconCheck width={16} height={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast must be used inside ToastProvider");
  return notify;
}
