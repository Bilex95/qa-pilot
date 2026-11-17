import Link from "next/link";

import { IconCompass } from "@/components/icons";

/** SCR-22 Not found (REQ-058). */
export function NotFoundScreen({ home }: { home: string }) {
  return (
    <div className="panel">
      <div className="state-box">
        <IconCompass className="big" />
        <h2>Page not found</h2>
        <p>The page you asked for does not exist, or the link is out of date.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn primary" href={home}>Go to dashboard</Link>
        </div>
        <div className="err-code">Error 404</div>
      </div>
    </div>
  );
}
