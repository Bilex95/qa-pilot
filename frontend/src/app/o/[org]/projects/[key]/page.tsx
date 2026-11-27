"use client";

import { useParams } from "next/navigation";

import { ProjectPage } from "@/modules/projects/project-page";
import { NotFoundScreen } from "@/modules/shell/not-found-screen";
import { useOrg } from "@/modules/shell/org-context";

/** /o/lumen/projects/WEB (SCR-07). A key that cannot be a project key is the 404 screen, like any unknown path. */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  const org = useOrg();
  if (!/^[A-Za-z]{2,6}$/.test(key)) return <NotFoundScreen home={`/o/${encodeURIComponent(org.slug)}/dashboard`} />;
  return <ProjectPage projectKey={key} />;
}
