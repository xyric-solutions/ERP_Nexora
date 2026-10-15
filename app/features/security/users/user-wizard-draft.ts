export interface UserWizardDraft {
  version: 1;
  draftId: string;
  step: number;
  displayName: string;
  username: string;
  email: string;
  employeeId: string;
  accountType?: "user" | "employee";
  companyIds: string[];
  defaultCompanyId: string;
  roleIds: string[];
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function userWizardDraftKey(tenantId: string, userId: string): string {
  return `nexora:user-wizard-draft:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function loadUserWizardDraft(storage: DraftStorage, key: string): UserWizardDraft | null {
  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return null;
    const draft = value as Record<string, unknown>;
    if (
      draft.version !== 1 ||
      typeof draft.draftId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(draft.draftId) ||
      typeof draft.step !== "number" ||
      !Number.isInteger(draft.step) ||
      typeof draft.displayName !== "string" ||
      typeof draft.username !== "string" ||
      typeof draft.email !== "string" ||
      typeof draft.employeeId !== "string" ||
      (draft.accountType !== undefined && draft.accountType !== "user" && draft.accountType !== "employee") ||
      !stringArray(draft.companyIds) ||
      typeof draft.defaultCompanyId !== "string" ||
      !stringArray(draft.roleIds)
    ) {
      return null;
    }
    return {
      version: 1,
      draftId: draft.draftId,
      step: Math.max(0, Math.min(4, draft.step)),
      displayName: draft.displayName.slice(0, 200),
      username: draft.username.slice(0, 128),
      email: draft.email.slice(0, 320),
      employeeId: draft.employeeId.slice(0, 128),
      ...(draft.accountType === undefined ? {} : { accountType: draft.accountType }),
      companyIds: [...new Set(draft.companyIds.map((item) => item.slice(0, 128)))].slice(0, 128),
      defaultCompanyId: draft.defaultCompanyId.slice(0, 128),
      roleIds: [...new Set(draft.roleIds.map((item) => item.slice(0, 128)))].slice(0, 64),
    };
  } catch {
    return null;
  }
}

export function hasUserWizardDraftContent(draft: UserWizardDraft): boolean {
  return Boolean(
    draft.displayName ||
    draft.username ||
    draft.email ||
    draft.employeeId ||
    draft.companyIds.length ||
    draft.roleIds.length,
  );
}

export function saveUserWizardDraft(storage: DraftStorage, key: string, draft: UserWizardDraft): void {
  if (hasUserWizardDraftContent(draft)) storage.setItem(key, JSON.stringify(draft));
  else storage.removeItem(key);
}

export function clearUserWizardDraft(storage: DraftStorage, key: string): void {
  storage.removeItem(key);
}

function payloadHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function userWizardSubmissionKey(draftId: string, payload: unknown): string {
  return `${draftId}:${payloadHash(JSON.stringify(payload))}`;
}
