"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardAppearanceMenu } from "@prototype/shared/theme/provider";
import { Button } from "../../components/ui/button";

import { useSession } from "../../lib/session/session-provider";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function DashboardHeaderControls() {
  const router = useRouter();
  const { logout, session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  if (!session) return null;

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  const { user } = session;
  return (
    <>
      <DashboardAppearanceMenu />
      <details className="nx-account-menu">
        <summary className="nx-avatar-button" aria-label="Open account menu" title="Account menu">
          {initials(user.display_name)}
        </summary>
        <div className="nx-account-menu__panel" role="menu" aria-label="Account options">
          <span className="nx-account-menu__identity">
            <strong>{user.display_name}</strong>
            <small>{user.email}</small>
          </span>
          <Button variant="ghost" size="sm" type="button" role="menuitem" disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </details>
    </>
  );
}
