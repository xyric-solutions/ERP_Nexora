"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  AuthenticationCompletionResponse,
  CancelTenantSelectionRequest,
  ChangeInitialPasswordRequest,
  PasswordLoginRequest,
  PasswordLoginResponse,
  SelectTenantRequest,
  SessionResponse,
} from "@nexora/contracts";

import { NexoraApiClient } from "../api/generated";
import { BrowserSessionClient } from "../auth/session-client";
import { apiBaseUrl } from "../../shared/config/runtime";

interface SessionContextValue {
  api: NexoraApiClient;
  session: SessionResponse | null;
  loading: boolean;
  login(payload: PasswordLoginRequest): Promise<PasswordLoginResponse>;
  selectTenant(payload: SelectTenantRequest): Promise<AuthenticationCompletionResponse>;
  cancelTenantSelection(payload: CancelTenantSelectionRequest): Promise<void>;
  changeInitialPassword(payload: ChangeInitialPasswordRequest): Promise<SessionResponse>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  csrfToken(): string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo(() => new NexoraApiClient(apiBaseUrl()), []);
  const client = useMemo(() => new BrowserSessionClient(api), [api]);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await client.restore());
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    client
      .restore()
      .then((restored) => {
        if (active) setSession(restored);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      session,
      loading,
      async login(payload) {
        const result = await client.loginWithPassword(payload);
        if (result.status === "authenticated") setSession(result);
        else setSession(null);
        return result;
      },
      async selectTenant(payload) {
        const result = await client.selectTenant(payload);
        if (result.status === "authenticated") setSession(result);
        else setSession(null);
        return result;
      },
      async cancelTenantSelection(payload) {
        await client.cancelTenantSelection(payload);
      },
      async changeInitialPassword(payload) {
        const result = await client.changeInitialPassword(payload);
        setSession(result);
        return result;
      },
      async logout() {
        await client.logout();
        setSession(null);
      },
      refresh,
      csrfToken: () => client.csrfTokenForRequest(),
    }),
    [api, client, loading, refresh, session],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
