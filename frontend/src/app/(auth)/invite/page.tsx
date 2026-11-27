import type { Metadata } from "next";

import { AuthLayout } from "@/modules/auth/components/auth-layout";
import { InviteAccept } from "@/modules/orgs/components/invite-accept";

export const metadata: Metadata = { title: "Invitation" };

/** The token is in the URL fragment (`/invite#<token>`), so this page needs no route parameter (D-055). */
export default function InvitePage() {
  return (
    <AuthLayout>
      <InviteAccept />
    </AuthLayout>
  );
}
