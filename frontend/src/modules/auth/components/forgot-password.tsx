import Link from "next/link";

/**
 * Forgot password (D-045, D-055). QA Pilot sends no email yet, so there is nothing to type here and no request to make:
 * the page explains how to get a reset link from a workspace admin. With no field and no request there is nothing to probe
 * (no account enumeration).
 */
export function ForgotPassword() {
  return (
    <>
      <h2>Forgot your password?</h2>
      <p className="muted">QA Pilot does not send email yet, so a workspace admin creates a reset link for you.</p>
      <ol className="stack" style={{ paddingLeft: 20, margin: "16px 0 0" }}>
        <li>Ask an Org Admin of your workspace to open <b>Members</b> and choose <b>Reset password</b> on your row.</li>
        <li>They send you the link themselves. It works once and expires after one hour.</li>
        <li>Open the link and choose a new password. Every device is signed out when you do.</li>
      </ol>
      <p className="small muted" style={{ marginTop: 16 }}>
        If you belong to more than one workspace, a workspace admin cannot reset your password. Ask whoever runs this QA Pilot
        installation for help.
      </p>
      <div className="stack" style={{ marginTop: 24 }}>
        <Link className="btn primary" href="/login">Back to sign in</Link>
      </div>
    </>
  );
}
