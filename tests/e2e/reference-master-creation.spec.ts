import { expect, test } from "@playwright/test";

// Browser interaction coverage uses API fixtures; PostgreSQL allocation and audit
// invariants are exercised separately in integration/reference-masters.test.ts.
for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 390]) {
    for (const [kind, title, action, prefix] of [
      ["projects", "New Project", "Create Project", "PRJ"],
      ["locations", "New Location / City", "Create Location", "LOC"],
    ] as const) {
      test(`${kind}: name-only creation at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((appearance) => localStorage.setItem("nexora-theme-preference-v1", appearance), theme);
        const records: Array<{
          id: string;
          company_id: string;
          code: string;
          name: string;
          status: string;
          version: number;
        }> = [];
        await page.route("**/api/v1/**", async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (path === "/api/v1/auth/session") {
            return route.fulfill({
              json: {
                status: "authenticated",
                tenant_id: "synthetic-reference-tenant",
                user: {
                  id: "synthetic-maker",
                  email: "maker@example.invalid",
                  display_name: "Synthetic maker",
                  roles: [],
                  permissions: [
                    "master_data.project.read",
                    "master_data.project.manage",
                    "master_data.location.read",
                    "master_data.location.manage",
                  ],
                },
                csrf_token: "c".repeat(43),
                idle_expires_at: "2099-01-01T00:00:00Z",
                absolute_expires_at: "2099-01-01T00:00:00Z",
              },
            });
          }
          if (path === `/api/v1/master_data/${kind}/companies`) {
            return route.fulfill({ json: { items: [{ id: "company-one", code: "ONE", name: "Synthetic company" }] } });
          }
          if (path === `/api/v1/master_data/${kind}`) {
            if (request.method() === "POST") {
              expect(request.postDataJSON()).toEqual({ company_id: "company-one", name: "New reference" });
              const record = {
                id: "reference-one",
                company_id: "company-one",
                code: `${prefix}-001`,
                name: "New reference",
                status: "active",
                version: 1,
              };
              records.push(record);
              return route.fulfill({ status: 201, json: { record, audit_event_id: "synthetic-audit" } });
            }
            return route.fulfill({ json: { items: records, next_cursor: null } });
          }
          return route.fulfill({ status: 404, json: { message: "No fixture for this endpoint" } });
        });
        await page.goto(`/#/finance/reporting-${kind}`);
        const add = page.getByRole("button", { name: "Add new", exact: true });
        await expect(add).toBeEnabled();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await add.click();
        const dialog = page.getByRole("dialog", { name: title, exact: true });
        const name = dialog.getByRole("textbox", { name: "Name", exact: true });
        await expect(name).toBeFocused();
        await expect(dialog.getByRole("textbox", { name: "Code", exact: true })).toHaveAttribute("readonly", "");
        await expect(dialog.getByRole("button", { name: action, exact: true })).toBeDisabled();
        await name.fill("   ");
        await expect(dialog.getByRole("button", { name: action, exact: true })).toBeDisabled();
        await name.fill("New reference");
        await name.hover();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: `tmp/reference-creation-evidence/${kind}-${theme}-${width}.png` });
        await name.press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("button", { name: `View ${prefix}-001`, exact: true })).toBeVisible();
        await add.click();
        await expect(name).toHaveValue("");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        expect(records).toHaveLength(1);
      });
    }
  }
}
