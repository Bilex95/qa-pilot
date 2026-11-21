import type { Metadata } from "next";
import { Suspense } from "react";

import { NewBugPage } from "@/modules/bugs/new-bug-page";

export const metadata: Metadata = { title: "Report a bug" };

export default function Page() {
  return (
    <Suspense>
      <NewBugPage />
    </Suspense>
  );
}
