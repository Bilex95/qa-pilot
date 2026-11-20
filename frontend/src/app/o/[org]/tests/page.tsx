import type { Metadata } from "next";
import { Suspense } from "react";

import { SuitesPage } from "@/modules/testing/suites-page";

export const metadata: Metadata = { title: "Test suites" };

export default function Page() {
  return (
    <Suspense>
      <SuitesPage />
    </Suspense>
  );
}
