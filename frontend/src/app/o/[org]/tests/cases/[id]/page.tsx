"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { CaseEditorPage } from "@/modules/testing/case-editor-page";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <CaseEditorPage caseRef={decodeURIComponent(id)} />
    </Suspense>
  );
}
