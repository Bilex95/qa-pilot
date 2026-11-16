import type { Metadata } from "next";

import { AuthLayout } from "@/modules/auth/components/auth-layout";
import { InviteAccept } from "@/modules/orgs/components/invite-accept";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthLayout>
      <InviteAccept token={token} />
    </AuthLayout>
  );
}
