import type { Metadata } from "next";
import { Suspense } from "react";

import { RunsPage } from "@/modules/testing/runs-page";

export const metadata: Metadata = { title: "Test runs" };

export default function Page() {
  return (
    <Suspense>
      <RunsPage />
    </Suspense>
  );
}
