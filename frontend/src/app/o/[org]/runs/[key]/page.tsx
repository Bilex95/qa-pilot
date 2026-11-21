"use client";

import { useParams } from "next/navigation";

import { NotFoundScreen } from "@/modules/shell/not-found-screen";
import { useOrg } from "@/modules/shell/org-context";
import { RunPage } from "@/modules/testing/run-page";

const KEY = /^R-\d{1,9}$/i;

/** /o/lumen/runs/R-31 (SCR-15). Anything that is not a run key is the 404 screen, like any unknown path. */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  const org = useOrg();
  if (!KEY.test(key)) return <NotFoundScreen home={`/o/${org.slug}/dashboard`} />;
  return <RunPage runRef={key} />;
}
