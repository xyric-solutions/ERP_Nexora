"use client";

import { useMemo } from "react";
import { isSuperAdmin } from "@nexora/contracts";

import { useSession } from "../../../lib/session/session-provider";
import { useAdminState } from "../model/admin-store";
import { AdministrationClient } from "./administration-client";

/** Client, prototype state and the signed-in user's Super Admin flag for Administration views. */
export function useAdministration() {
  const { api, session } = useSession();
  // Creating the client seeds the prototype store before the state is read below.
  const client = useMemo(() => (session ? new AdministrationClient(api, session) : null), [api, session]);
  const state = useAdminState();
  const superAdmin = session ? isSuperAdmin(session.user.permissions) : false;
  return { client, state, session, superAdmin };
}
