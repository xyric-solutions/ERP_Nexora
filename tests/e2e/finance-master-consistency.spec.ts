import { expect, test, type Locator } from "@playwright/test";

const category = {
  id: "category-one",
  company_id: "company-one",
  code: "CAT-001",
  name: "Current Assets",
  type: "asset",
  parent_id: null,
  status: "active",
  version: 1,
  section_count: 1,
  nominal_count: 1,
};
const section = {
  ...category,
  id: "section-one",
  code: "1101",
  name: "Receivables",
  parent_id: category.id,
  section_count: 0,
};
const nominal = {
  id: "nominal-one",
  company_id: "company-one",
  code: "110101",
  name: "Trade receivables",
  description: null,
  type: "asset",
  account_status: "active",
  is_header: false,
  category: { id: category.id, code: category.code, name: category.name },
  section: { id: section.id, code: section.code, name: section.name },
  currency: "USD",
  bank_account_id: null,
  identity_mode: "nominal_only",
  state: "active",
  version: 1,
  banking_available: false,
};
const options = {
  companies: [{ id: "company-one", code: "ONE", name: "Example company" }],
  selected_company_id: "company-one",
  categories: [category, { id: "category-two", code: "CAT-002", name: "Non-current Assets" }],
  sections: [
    { ...section, category_id: category.id, section_role: "general", creation_enabled: true },
    {
      id: "section-two",
      code: "1201",
      name: "Long-term receivables",
      category_id: "category-two",
      type: "asset",
      section_role: "general",
      creation_enabled: true,
    },
  ],
  currencies: [{ code: "USD", name: "US Dollar", decimal_places: 2, is_base: true }],
  setup: { cash_and_bank_configured: true, code_policy_configured: true },
};

async function checkPlain(button: Locator) {
  await button.page().mouse.move(0, 0);
  const header = button.locator("..");
  const colors = await button.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--nx-surface)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      actual: getComputedStyle(element.parentElement!).backgroundColor,
      expected,
      ink: getComputedStyle(element.querySelector("strong")!).color,
    };
  });
  expect(colors.actual).toBe(colors.expected);
  const luminance = (color: string) => {
    const rgb = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const background = luminance(colors.actual),
    foreground = luminance(colors.ink);
  // Rows follow the plain theme surface, with compact wrapping in either theme.
  const width = button.page().viewportSize()!.width;
  const box = await header.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(width >= 1440 ? 48 : width >= 768 ? 64 : 100);
  for (const color of await header
    .locator('[data-slot="badge"], [data-slot="button"]')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color))) {
    const ink = luminance(color);
    expect((Math.max(background, ink) + 0.05) / (Math.min(background, ink) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
  expect((Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)).toBeGreaterThanOrEqual(
    4.5,
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 390]) {
    test(`Chart of Accounts uses compact plain rows and actions: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const errors: string[] = [],
        writes: string[] = [];
      let nominalReads = 0;
      let reviewState: "active" | "draft" | "pending_approval" = "active";
      let imported = false;
      let classification = "ordinary";
      let nominalVersion = 1;
      const classifications: unknown[] = [];
      const activations: { body: unknown; key: string | undefined }[] = [];
      const decisions: { body: unknown; key: string | undefined }[] = [];
      const hierarchy = [
        { ...category, state: "active", version: 2 },
        { ...section, state: "active", version: 2 },
      ];
      const hierarchyChanges: {
        id: string;
        body: { action?: string; expected_version: number };
        key: string | undefined;
      }[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/v1/**", async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        if (
          path === "/api/v1/finance/chart_templates/company_nominals/nominal-one/classification" &&
          request.method() === "POST"
        ) {
          classifications.push(request.postDataJSON());
          classification = request.postDataJSON().classification;
          nominalVersion++;
          return route.fulfill({ json: { nominal_id: nominal.id, classification, version: nominalVersion } });
        }
        if (path === "/api/v1/finance/nominals/nominal-one/status" && request.method() === "POST") {
          activations.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
          if (activations.length === 1)
            return route.fulfill({ status: 409, json: { detail: "Synthetic activation conflict", status: 409 } });
          reviewState = "active";
          return route.fulfill({ json: { ...nominal, state: reviewState, version: ++nominalVersion } });
        }
        if (path.startsWith("/api/v1/finance/hierarchy/") && request.method() === "PATCH") {
          const id = path.split("/").at(-1)!;
          const item = hierarchy.find((row) => row.id === id)!;
          const body = request.postDataJSON();
          hierarchyChanges.push({ id, body, key: request.headers()["idempotency-key"] });
          if (
            body.action === "approve" &&
            hierarchyChanges.filter((change) => change.id === id && change.body.action === "approve").length === 1
          )
            return route.fulfill({ status: 409, json: { detail: "Synthetic hierarchy conflict", status: 409 } });
          item.state = body.action === "submit" ? "pending_approval" : "active";
          item.status = item.state === "active" ? "active" : "inactive";
          item.version++;
          return route.fulfill({ json: item });
        }
        if (path === "/api/v1/finance/nominals/nominal-one/decision" && request.method() === "POST") {
          decisions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
          if (decisions.length === 1)
            return route.fulfill({ status: 409, json: { detail: "Synthetic conflict", status: 409 } });
          reviewState = "active";
          return route.fulfill({ json: { ...nominal, state: reviewState } });
        }
        if (request.method() !== "GET") {
          writes.push(path);
          return route.abort();
        }
        if (path === "/api/v1/auth/session")
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "synthetic-finance-review",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "synthetic-admin",
                email: "admin@example.invalid",
                display_name: "Finance reviewer",
                roles: ["super_administrator"],
                permissions: [
                  "finance.nominal.read",
                  "finance.nominal.create",
                  "finance.nominal.update",
                  "finance.nominal.status",
                  "finance.nominal.submit",
                  "finance.nominal.approve",
                  "finance.chart_template.read",
                  "finance.chart_template.classify",
                  "platform.approval.override",
                ],
              },
            },
          });
        if (path === "/api/v1/finance/nominals/options") return route.fulfill({ json: options });
        if (path === "/api/v1/finance/hierarchy")
          return route.fulfill({ json: { items: hierarchy, next_cursor: null } });
        if (path === "/api/v1/finance/nominals") {
          nominalReads++;
          return route.fulfill({ json: { items: [{ ...nominal, state: reviewState }], next_cursor: null } });
        }
        if (path === "/api/v1/finance/nominals/nominal-one")
          return route.fulfill({
            json: {
              ...nominal,
              state: reviewState,
              posting_classification: classification,
              chart_template_id: imported ? "template-one" : null,
              version: nominalVersion,
              created_at: "2026-11-04T00:00:00Z",
              self_decision_requires_override: false,
              super_admin_override_allowed: false,
              capabilities: {
                update: reviewState !== "pending_approval",
                submit: reviewState === "draft",
                decide: reviewState === "pending_approval",
                deactivate: reviewState === "active",
                activate: reviewState === "draft" && classification === "ordinary",
              },
              events: [],
            },
          });
        return route.fulfill({ status: 404, json: { message: "No fixture for this endpoint" } });
      });

      await page.goto("/#/finance/coa-categories");
      const categoryButton = page.locator("[data-finance-master-trigger]").filter({ hasText: category.name });
      await expect(categoryButton).toHaveAttribute("aria-expanded", "false");
      await checkPlain(categoryButton);
      await categoryButton.focus();
      await page.keyboard.press("Enter");
      const sectionButton = page.locator('[data-finance-master-trigger][aria-controls="section-section-one"]');
      await expect(sectionButton).toHaveAttribute("aria-expanded", "false");
      expect(nominalReads).toBe(0);
      await checkPlain(sectionButton);
      await sectionButton.focus();
      await page.keyboard.press("Enter");
      const nominalButton = page.locator("[data-finance-master-trigger]").filter({ hasText: nominal.name });
      await expect(nominalButton).toBeVisible();
      await checkPlain(nominalButton);
      await page.screenshot({ path: `tmp/finance-plain-evidence/categories-${theme}-${width}.png` });
      await nominalButton.click();
      await expect(page).toHaveURL(/finance\/add-nominal\/nominal-one$/);
      await expect(page.locator("#nominal-name")).toHaveValue(nominal.name);
      await expect(page.locator("form")).toBeVisible();
      await expect(page.locator("#nominal-posting-classification")).toHaveCount(0);
      await page.goto("/#/finance/coa-categories");
      await categoryButton.click();
      await sectionButton.click();
      await page
        .locator('[data-slot="finance-master-row"]')
        .filter({ has: nominalButton })
        .getByRole("button", { name: "Open", exact: true })
        .click();
      await expect(page).toHaveURL(/finance\/nominal-detail\/nominal-one$/);
      await expect(page.getByText("110101 · Trade receivables", { exact: true })).toBeVisible();

      await page.goto("/#/finance/coa-sections");
      await expect(sectionButton).toHaveAttribute("aria-expanded", "false");
      const before = nominalReads;
      await checkPlain(sectionButton);
      await sectionButton.click();
      await expect(nominalButton).toBeVisible();
      expect(nominalReads).toBe(before + 1);
      await page.mouse.move(0, 0);
      await checkPlain(sectionButton);
      await page.screenshot({ path: `tmp/finance-plain-evidence/sections-${theme}-${width}.png` });
      await page
        .locator('[data-slot="finance-master-row"]')
        .filter({ has: sectionButton })
        .locator(":scope > [data-finance-master-header]")
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await expect(page).toHaveURL(/finance\/add-coa-section\//);
      await expect(page.locator("#hierarchy-name")).toHaveValue(section.name);

      await page.goto("/#/finance/nominals");
      await expect(nominalButton).toBeVisible();
      await checkPlain(nominalButton);
      const nominalRow = page.locator('[data-slot="finance-master-row"]').filter({ has: nominalButton });
      await expect(nominalRow.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
      const box = await nominalButton.boundingBox();
      expect(box!.width).toBeGreaterThan(120);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `tmp/finance-plain-evidence/nominals-${theme}-${width}.png` });
      await nominalRow.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(page).toHaveURL(/finance\/add-nominal\/nominal-one$/);
      await expect(page.locator("#nominal-name")).toHaveValue(nominal.name);
      await expect(page.locator("#nominal-section")).toBeEnabled();
      await page.locator("#nominal-section").selectOption("section-two");
      await expect(page.locator("#nominal-category")).toHaveValue("Non-current Assets");
      await expect(page.locator("#nominal-category")).toHaveAttribute("readonly", "");
      await expect(page.locator("#nominal-code")).toHaveValue(nominal.code);
      await page.locator("#nominal-name").fill("Long-term trade receivables");
      await page.screenshot({ path: `tmp/finance-edit-evidence/edit-${theme}-${width}.png` });

      // Synthetic draft/pending records always open details for review before a decision.
      page.once("dialog", (dialog) => dialog.accept());
      reviewState = "draft";
      await page.goto("/#/finance/nominals");
      await nominalButton.click();
      await expect(page).toHaveURL(/finance\/nominal-detail\/nominal-one$/);
      await expect(page.locator("#nominal-name")).toHaveValue(nominal.name);
      await expect(page.getByRole("button", { name: "Approve & Close", exact: true })).toBeVisible();
      await expect(page.getByText("Review posting eligibility", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page).toHaveURL(/finance\/nominals$/);
      expect(decisions).toHaveLength(0);

      reviewState = "pending_approval";
      await page.reload();
      await nominalRow.getByRole("button", { name: "Review", exact: true }).click();
      await expect(page.getByText("pending approval", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit nominal", exact: true })).toHaveCount(0);
      await page.screenshot({ path: `tmp/finance-plain-evidence/review-${theme}-${width}.png` });
      const approval = page.locator("form");
      await approval.getByRole("button", { name: "Approve & Close", exact: true }).click();
      await expect(page.getByText("Synthetic conflict", { exact: false })).toBeVisible();
      await expect(page).toHaveURL(/finance\/nominal-detail\/nominal-one$/);
      await approval.getByRole("button", { name: "Approve & Close", exact: true }).click();
      await expect(page).toHaveURL(/finance\/nominals$/);
      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toEqual(decisions[1]);
      expect(decisions[0].body).toEqual({ expected_version: 1, action: "approve" });
      expect(decisions[0].key).toBeTruthy();
      imported = true;
      classification = "review_required";
      reviewState = "draft";
      await page.goto("/#/finance/nominal-detail/nominal-one");
      await expect(page.locator("#nominal-name")).toHaveValue(nominal.name);
      await expect(page.locator("#nominal-code")).toHaveValue(nominal.code);
      await expect(page.locator("#nominal-description")).toBeVisible();
      await expect(page.locator("#nominal-posting-classification")).toHaveCount(0);
      const approveDraft = page.getByRole("button", { name: "Approve & Close", exact: true });
      await expect(approveDraft).toBeDisabled();
      await page.locator("#nominal-account-use").selectOption("module_controlled");
      await expect(approveDraft).toBeDisabled();
      await page.locator("#nominal-account-use").selectOption("ordinary");
      await expect(approveDraft).toBeEnabled();
      await page.screenshot({ path: `tmp/finance-creation-approval-evidence/nominal-${theme}-${width}.png` });
      await approveDraft.click();
      await expect(page.getByText("Synthetic activation conflict", { exact: false })).toBeVisible();
      await approveDraft.click();
      await expect(page).toHaveURL(/finance\/nominals$/);
      expect(classifications).toHaveLength(1);
      expect(activations).toHaveLength(2);
      expect(activations[0]).toEqual(activations[1]);
      expect(activations[0].body).toMatchObject({ expected_version: 2, action: "activate" });
      for (const [index, kind] of ["category", "section"].entries()) {
        const item = hierarchy[index];
        item.state = "draft";
        item.status = "inactive";
        const directory = kind === "category" ? "coa-categories" : "coa-sections";
        await page.goto(`/#/finance/${directory}`);
        const row = page.locator('[data-slot="finance-master-row"]').filter({ hasText: item.name }).first();
        await row
          .locator(":scope > [data-finance-master-header]")
          .getByRole("button", { name: "Review", exact: true })
          .click();
        await expect(page.locator("#hierarchy-name")).toHaveValue(item.name);
        await expect(page.locator("#hierarchy-code")).toHaveValue(item.code);
        await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Approve & Close", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`finance/${directory}$`));
        expect(hierarchyChanges.filter((change) => change.id === item.id)).toHaveLength(0);
        await row
          .locator(":scope > [data-finance-master-header]")
          .getByRole("button", { name: "Review", exact: true })
          .click();
        await page.screenshot({ path: `tmp/finance-hierarchy-approval-evidence/${kind}-${theme}-${width}.png` });
        await page.getByRole("button", { name: "Approve & Close", exact: true }).click();
        await expect(page.getByRole("alert").filter({ hasText: "Synthetic hierarchy conflict" })).toBeVisible();
        await expect(page.locator("#hierarchy-name")).toHaveValue(item.name);
        await expect(page.locator("#hierarchy-name")).toBeDisabled();
        expect(item.status).toBe("inactive");
        await page.getByRole("button", { name: "Approve & Close", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`finance/${directory}$`));
        expect(item.state).toBe("active");
        await expect(page.getByText("Bank updated successfully", { exact: true })).toHaveCount(0);
        const approvals = hierarchyChanges.filter(
          (change) => change.id === item.id && change.body.action === "approve",
        );
        expect(approvals).toHaveLength(2);
        expect(approvals[0]).toEqual(approvals[1]);
        expect(approvals[0].key).toBeTruthy();
      }
      expect(errors).toEqual([]);
      expect(writes).toEqual([]);
    });
  }
}
