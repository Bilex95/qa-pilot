import { READINESS_NAME, type Readiness } from "../releases";

/** Colour plus a dot plus the word, never colour alone (REQ-021); the classes are the locked design's. */
export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  return (
    <span className={`badge ${readiness}`}>
      <span className="dot" />
      {READINESS_NAME[readiness]}
    </span>
  );
}
