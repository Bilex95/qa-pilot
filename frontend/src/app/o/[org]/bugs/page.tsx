import type { Metadata } from "next";
import { Suspense } from "react";

import { BugsPage } from "@/modules/bugs/bugs-page";

export const metadata: Metadata = { title: "Bugs" };

export default function Page() {
  return (
    <Suspense>
      <BugsPage />
    </Suspense>
  );
}
