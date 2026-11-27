"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { IconX } from "@/components/icons";

import { Button } from "./button";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";

type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Modal dialog in the locked design (.modal-back, .modal). Focus moves into the dialog, Tab stays inside it,
 * Escape and a click on the backdrop close it, and focus returns to the control that opened it (NFR accessibility).
 */
export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <IconX />
          </Button>
        </div>
        {children}
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}
