import type { Metadata } from "next";

import { AuthLayout } from "@/modules/auth/components/auth-layout";
import { ForgotPassword } from "@/modules/auth/components/forgot-password";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPassword />
    </AuthLayout>
  );
}
