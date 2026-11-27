import type { Metadata } from "next";

import { UsagePage } from "@/modules/ai/usage-page";

export const metadata: Metadata = { title: "AI usage" };

export default function Page() {
  return <UsagePage />;
}
