"use client";

import { useParams } from "next/navigation";

import { isReleaseId, ReleasePage } from "@/modules/releases/release-page";
import { NotFoundScreen } from "@/modules/shell/not-found-screen";
import { useOrg } from "@/modules/shell/org-context";

/** /o/lumen/releases/<id> (SCR-17). Anything that is not a release id is the 404 screen, like any unknown path. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const org = useOrg();
  if (!isReleaseId(id)) return <NotFoundScreen home={`/o/${encodeURIComponent(org.slug)}/dashboard`} />;
  return <ReleasePage releaseId={id} />;
}
