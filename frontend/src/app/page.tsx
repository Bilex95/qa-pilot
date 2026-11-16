"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingPanel } from "@/components/ui/feedback";
import { homeFor, useSession } from "@/lib/session/session-provider";

/** Entry point: first workspace when signed in, otherwise sign in. */
export default function Home() {
  const { status, me } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    if (status === "authenticated" && me) router.replace(homeFor(me));
  }, [status, me, router]);
  return (
    <main id="main" className="content">
      <LoadingPanel rows={2} />
    </main>
  );
}
