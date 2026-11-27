import type { Metadata } from "next";
import { Suspense } from "react";

import { ProjectsPage } from "@/modules/projects/projects-page";

export const metadata: Metadata = { title: "Projects" };

export default function Page() {
  return (
    <Suspense>
      <ProjectsPage />
    </Suspense>
  );
}
