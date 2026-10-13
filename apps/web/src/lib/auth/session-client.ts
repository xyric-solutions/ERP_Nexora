import type {
  AuthenticationCompletionResponse,
  CancelTenantSelectionRequest,
  ChangeInitialPasswordRequest,
  PasswordLoginRequest,
  PasswordLoginResponse,
  SelectTenantRequest,
  SessionResponse,
} from "@nexora/contracts";

import type { NexoraApiClient } from "../api/generated.js";

type SessionTransport = Pick<
  NexoraApiClient,
  | "loginWithPassword"
  | "selectTenant"
  | "changeInitialPassword"
  | "cancelTenantSelection"
  | "getSession"
  | "rotateSession"
  | "logout"
  | "logoutAll"
>;

export class BrowserSessionClient {
  private csrfToken: string | null = null;

  constructor(private readonly api: SessionTransport) {}

  async loginWithPassword(payload: PasswordLoginRequest): Promise<PasswordLoginResponse> {
    const session = await this.api.loginWithPassword(payload);
    if (session.status === "authenticated") this.csrfToken = session.csrf_token;
    return session;
  }

  async selectTenant(payload: SelectTenantRequest): Promise<AuthenticationCompletionResponse> {
    const result = await this.api.selectTenant(payload);
    if (result.status === "authenticated") this.csrfToken = result.csrf_token;
    return result;
  }

  cancelTenantSelection(payload: CancelTenantSelectionRequest): Promise<void> {
    return this.api.cancelTenantSelection(payload);
  }

  async changeInitialPassword(payload: ChangeInitialPasswordRequest): Promise<SessionResponse> {
    const session = await this.api.changeInitialPassword(payload);
    this.csrfToken = session.csrf_token;
    return session;
  }

  async restore(): Promise<SessionResponse> {
    const session = await this.api.getSession();
    this.csrfToken = session.csrf_token;
    return session;
  }

  async rotate(): Promise<SessionResponse> {
    const session = await this.api.rotateSession(this.requireCsrfToken());
    this.csrfToken = session.csrf_token;
    return session;
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout(this.requireCsrfToken());
    } finally {
      this.csrfToken = null;
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await this.api.logoutAll(this.requireCsrfToken());
    } finally {
      this.csrfToken = null;
    }
  }

  csrfTokenForRequest(): string {
    return this.requireCsrfToken();
  }

  private requireCsrfToken(): string {
    if (!this.csrfToken) throw new Error("No active browser session is available");
    return this.csrfToken;
  }
}
