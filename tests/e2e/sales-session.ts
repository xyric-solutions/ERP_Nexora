import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared mocks for Sales e2e specs. Sales records are browser-session data;
 * only the session and the Master Data project/location lists are served.
 * Every write is refused and recorded so a spec can prove nothing is sent.
 */

export const SALES_COMPANY = "sales-e2e-company";

const master = (id: string, code: string, name: string) => ({
  id,
  company_id: SALES_COMPANY,
  code,
  name,
  status: "active",
  version: 1,
  created_by: "admin",
  updated_by: "admin",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
});

export const PROJECTS = [master("prj-1", "PRJ-001", "Lahore Plant Upgrade"), master("prj-2", "PRJ-002", "Karachi Port Expansion")];
export const LOCATIONS = [master("loc-1", "LOC-001", "Lahore"), master("loc-2", "LOC-002", "Karachi")];

export interface SalesMocks {
  writes: string[];
  /** Query strings of every project/location list request, by kind. */
  masterQueries: { kind: string; query: URLSearchParams }[];
}

export async function signInToSales(page: Page): Promise<SalesMocks> {
  const mocks: SalesMocks = { writes: [], masterQueries: [] };
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== "GET") {
      mocks.writes.push(path);
      return route.abort();
    }
    if (path === "/api/v1/auth/session")
      return route.fulfill({
        json: {
          status: "authenticated",
          tenant_id: "sales-e2e-tenant",
          csrf_token: "c".repeat(43),
          idle_expires_at: "2099-01-01T00:00:00Z",
          absolute_expires_at: "2099-01-01T00:00:00Z",
          user: { id: "sales", email: "sales@example.invalid", display_name: "Sales Maker", roles: ["super_admin"], permissions: [] },
          active_company: { id: SALES_COMPANY, code: "SLS", name: "Synthetic sales company" },
        },
      });
    const kind = path.match(/^\/api\/v1\/master_data\/(projects|locations)$/)?.[1];
    if (kind) {
      mocks.masterQueries.push({ kind, query: url.searchParams });
      return route.fulfill({ json: { items: kind === "projects" ? PROJECTS : LOCATIONS, next_cursor: null } });
    }
    return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
  });
  return mocks;
}

/** Picks a project and a location in a form (both required on every Sales transaction). */
export async function chooseProjectLocation(page: Page, scope: Locator | Page = page, project = "PRJ-001 · Lahore Plant Upgrade", location = "LOC-001 · Lahore") {
  await scope.getByLabel("Project", { exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await scope.getByLabel("Location", { exact: true }).click();
  await page.getByRole("option", { name: location, exact: true }).click();
  await expect(scope.getByLabel("Project", { exact: true })).toContainText(project);
}
