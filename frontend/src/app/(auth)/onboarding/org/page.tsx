import type { Metadata } from "next";

import { RequireAuth } from "@/lib/session/require-auth";
import { AuthLayout } from "@/modules/auth/components/auth-layout";
import { OrgSetupForm } from "@/modules/orgs/components/org-setup-form";

export const metadata: Metadata = { title: "Set up workspace" };

export default function OrgSetupPage() {
  return (
    <AuthLayout>
      <RequireAuth>
        <OrgSetupForm />
      </RequireAuth>
    </AuthLayout>
  );
}
