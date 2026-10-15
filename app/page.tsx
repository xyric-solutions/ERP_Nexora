"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

import { DashboardHeaderControls } from "./features/dashboard/dashboard-header-controls";
import IdentityWorkspace from "./features/security/identity-workspace";
import { useSession } from "./lib/session/session-provider";
import { PrototypeShell } from "./shell/prototype-shell";

export default function Home() {
  const router = useRouter();
  const { loading, session } = useSession();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);

  if (loading || !session) {
    return <main aria-live="polite">Opening secure workspace&hellip;</main>;
  }

  return (
    <PrototypeShell
      headerControls={<DashboardHeaderControls />}
      identityContent={
        <Suspense fallback={<main>Loading Identity &amp; Access&hellip;</main>}>
          <IdentityWorkspace embedded />
        </Suspense>
      }
    />
  );
}
