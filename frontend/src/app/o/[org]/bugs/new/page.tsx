import type { Metadata } from "next";

import { NewBugPage } from "@/modules/bugs/new-bug-page";

export const metadata: Metadata = { title: "Report a bug" };

export default function Page() {
  return <NewBugPage />;
}
