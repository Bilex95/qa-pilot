import type { Metadata } from "next";

import { AuthLayout } from "@/modules/auth/components/auth-layout";
import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

/** The token is in the URL fragment (`/reset-password#<token>`), so this page needs no route parameter (D-055). */
export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
