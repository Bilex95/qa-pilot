import type { Metadata } from "next";

import { MembersPage } from "@/modules/members/members-page";

export const metadata: Metadata = { title: "Members" };

export default function Page() {
  return <MembersPage />;
}
