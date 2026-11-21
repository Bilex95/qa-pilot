"use client";

import { useParams } from "next/navigation";

import { BugDetailPage } from "@/modules/bugs/bug-detail-page";
import { NotFoundScreen } from "@/modules/shell/not-found-screen";
import { useOrg } from "@/modules/shell/org-context";

const KEY = /^[A-Za-z]{2,6}-\d{1,9}$/;

/** /o/lumen/bugs/WEB-42 (SCR-10). Anything that is not a bug key is the 404 screen, like any unknown path. */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  const org = useOrg();
  if (!KEY.test(key)) return <NotFoundScreen home={`/o/${org.slug}/dashboard`} />;
  return <BugDetailPage bugRef={key} />;
}
