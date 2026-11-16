"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LoadingPanel } from "@/components/ui/feedback";

import { useSession } from "./session-provider";

/** Client side guard: sends anonymous visitors to sign in and back here afterwards. The API enforces auth itself. */
export function RequireAuth({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { status, signedOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status !== "anonymous") return;
    router.replace(signedOut ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
  }, [status, signedOut, router, pathname]);
  if (status !== "authenticated") return <>{fallback ?? <LoadingPanel rows={3} />}</>;
  return <>{children}</>;
}
