import type { Metadata } from "next";

import { ReportsPage } from "@/modules/dashboard/reports-page";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ReportsPage />;
}
