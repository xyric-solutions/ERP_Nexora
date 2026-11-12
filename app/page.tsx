"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

import { DashboardHeaderControls } from "./features/dashboard/dashboard-header-controls";
import IdentityWorkspace from "./features/security/identity-workspace";
import { useSession } from "./lib/session/session-provider";
import { PrototypeShell } from "./shell/prototype-shell";

export default function Home() {
  const router = useRouter();
  const { activeCompany, loading, session } = useSession();

  // No session: sign in. Signed in but no company chosen yet: the company list on the sign-in page.
  useEffect(() => {
    if (!loading && (!session || !activeCompany)) router.replace("/login");
  }, [activeCompany, loading, router, session]);

  if (loading || !session || !activeCompany) {
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
