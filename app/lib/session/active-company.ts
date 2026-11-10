/**
 * The company chosen after sign-in. The session provider keeps it current; feature API clients use it so every
 * company list (and every company-scoped request) stays inside that company. The API enforces the same rule.
 */
let activeCompanyId: string | null = null;

export function setActiveCompanyId(companyId: string | null) {
  activeCompanyId = companyId;
}

export function getActiveCompanyId() {
  return activeCompanyId;
}

/** Narrows a company directory to the company chosen after sign-in (unchanged before a company is chosen). */
export function inActiveCompany<T extends { items: readonly { id: string }[] }>(directory: T): T {
  const id = activeCompanyId;
  return id ? { ...directory, items: directory.items.filter((company) => company.id === id) } : directory;
}
