import type { Metadata } from "next";
import { Suspense } from "react";

import { CaseEditorPage } from "@/modules/testing/case-editor-page";

export const metadata: Metadata = { title: "New test case" };

export default function Page() {
  return (
    <Suspense>
      <CaseEditorPage />
    </Suspense>
  );
}
