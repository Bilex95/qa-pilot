import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthLayout } from "@/modules/auth/components/auth-layout";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
