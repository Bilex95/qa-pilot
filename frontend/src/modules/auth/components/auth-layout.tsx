import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { IconSpark } from "@/components/icons";

/** SCR-01 to SCR-04 frame from the locked prototype: brand panel with the AI proof mark example, form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Brand href="/login" />
        <h1>Rough notes in. Clear bug reports out.</h1>
        <p>Report bugs, run test cycles and see release risk in one place. AI drafts the tedious parts; you decide what gets saved.</p>
        <div className="auth-demo" aria-hidden="true">
          <div className="raw">&ldquo;checkout total wrong after changing address, discount gone, prod, chrome&rdquo;</div>
          <div className="suggest" style={{ padding: 14 }}>
            <div className="suggest-tag">
              <IconSpark />
              AI suggestion, not saved
            </div>
            <div style={{ fontWeight: 700 }}>
              <mark>Checkout total ignores discount code after changing delivery address</mark>
            </div>
            <div className="row small" style={{ marginTop: 8 }}>
              <span className="badge sev-critical"><span className="dot" />Critical</span>
              <span className="muted">Checkout, prod</span>
            </div>
          </div>
        </div>
      </aside>
      <main className="auth-main" id="main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
