import { Suspense } from "react";
import IdentityWorkspace from "../../../src/features/security/identity-workspace";

export default function IdentityPage() {
  return (
    <Suspense fallback={<main>Loading Identity &amp; Access…</main>}>
      <IdentityWorkspace />
    </Suspense>
  );
}
