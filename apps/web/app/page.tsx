"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PrototypeShell } from "../../../app/prototype-shell";

import { DashboardHeaderControls } from "../src/features/dashboard/dashboard-header-controls";
import IdentityWorkspace from "../src/features/security/identity-workspace";
import { useSession } from "../src/lib/session/session-provider";

export default function HomePage() {
  const router = useRouter();
  const { loading, session } = useSession();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);

  if (loading || !session) {
    return <main aria-live="polite">Opening secure workspace…</main>;
  }

  return (
    <PrototypeShell
      headerControls={<DashboardHeaderControls />}
      identityContent={
        <Suspense fallback={<main>Loading Identity &amp; Access…</main>}>
          <IdentityWorkspace embedded />
        </Suspense>
      }
    />
  );
}
