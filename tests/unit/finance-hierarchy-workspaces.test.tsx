// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FinanceCategories,
  FinanceHierarchyForm,
  FinanceSections,
  encodeHierarchyRouteReference,
} from "../../app/features/finance/views/finance-hierarchy-workspaces.js";

const harness = vi.hoisted(() => ({
  canApprove: true,
  api: {
    listFinanceNominalOptions: vi.fn(),
    listFinanceHierarchy: vi.fn(),
    listFinanceNominals: vi.fn(),
    createFinanceHierarchy: vi.fn(),
    changeFinanceHierarchy: vi.fn(),
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "synthetic-csrf",
    loading: false,
    session: {
      tenant_id: "tenant-1",
      impersonation: null,
      user: {
        id: "admin-1",
        roles: ["super_administrator"],
        permissions: [
          "platform.approval.override",
          "finance.nominal.read",
          "finance.nominal.create",
          "finance.nominal.update",
          "finance.nominal.status",
          "finance.nominal.submit",
          "finance.nominal.approve",
        ].filter((permission) => harness.canApprove || permission !== "finance.nominal.approve"),
      },
    },
  }),
}));

const category = {
  id: "category-assets",
  company_id: "company-1",
  code: "CAT-ASSETS",
  name: "Current Assets",
  type: "asset" as const,
  parent_id: null,
  status: "active" as const,
  version: 1,
  section_count: 9,
  nominal_count: 27,
};
const section = {
  id: "section-cash",
  company_id: "company-1",
  code: "2309",
  name: "Cash and Bank",
  type: "asset" as const,
  parent_id: category.id,
  status: "active" as const,
  version: 2,
  section_count: 0,
  nominal_count: 7,
};

let container: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle(delay = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, delay));
  });
}

function change(id: string, value: string) {
  const element = container.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement;
  act(() => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  harness.canApprove = true;
  harness.api.listFinanceNominalOptions.mockResolvedValue({
    companies: [{ id: "company-1", code: "C1", name: "Synthetic Company" }],
    selected_company_id: "company-1",
    categories: [{ id: category.id, code: category.code, name: category.name }],
    sections: [
      {
        id: section.id,
        code: section.code,
        name: section.name,
        category_id: category.id,
        section_role: "cash_and_bank",
        creation_enabled: true,
      },
    ],
    currencies: [{ code: "PKR", name: "Pakistan Rupee", decimal_places: 2, is_base: true }],
    setup: { cash_and_bank_configured: true, code_policy_configured: true },
  });
  harness.api.listFinanceHierarchy.mockResolvedValue({ items: [category, section], next_cursor: null });
  harness.api.listFinanceNominals.mockResolvedValue({
    items: [
      {
        id: "nominal-1",
        company_id: "company-1",
        code: "230901",
        name: "Main Bank Account",
        description: null,
        type: "asset",
        account_status: "active",
        is_header: false,
        category: { id: category.id, code: category.code, name: category.name },
        section: { id: section.id, code: section.code, name: section.name },
        currency: "PKR",
        bank_account_id: null,
        identity_mode: "nominal_only",
        state: "active",
        version: 2,
        banking_available: true,
      },
    ],
    next_cursor: null,
  });
  harness.api.createFinanceHierarchy.mockResolvedValue(category);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Chart of Accounts hierarchy workspaces", () => {
  it("shows exact server totals collapsed, then lazily loads Nominals through Section expansion", async () => {
    await act(async () =>
      root.render(
        <FinanceCategories onCreate={vi.fn()} onEdit={vi.fn()} onOpenNominal={vi.fn()} onStandardChart={vi.fn()} />,
      ),
    );
    await settle();

    const categoryButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Current Assets"),
    )!;
    expect(categoryButton.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("9 Sections");
    expect(container.textContent).toContain("27 Nominals");
    expect(container.textContent).not.toContain("Cash and Bank");

    act(() => categoryButton.click());
    expect(container.textContent).toContain("Cash and Bank");
    expect(harness.api.listFinanceNominals).not.toHaveBeenCalled();

    const sectionButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("2309") && button.textContent?.includes("Cash and Bank"),
    )!;
    act(() => sectionButton.click());
    await settle();

    expect(harness.api.listFinanceNominals).toHaveBeenCalledWith(expect.stringContaining("section_id=section-cash"));
    expect(container.textContent).toContain("230901");
    expect(container.textContent).toContain("Main Bank Account");
  });

  it("groups Sections under bold Category headings with their persisted codes and totals", async () => {
    const edit = vi.fn(),
      open = vi.fn();
    await act(async () =>
      root.render(<FinanceSections onCreate={vi.fn()} onEdit={edit} onOpenNominal={open} onStandardChart={vi.fn()} />),
    );
    await settle();

    const heading = [...container.querySelectorAll("h2")].find((item) => item.textContent === "Current Assets");
    expect(heading?.className).toContain("font-bold");
    expect(container.textContent).toContain("2309");
    expect(container.textContent).toContain("Cash and Bank");
    expect(container.textContent).toContain("7");
    const disclosure = container.querySelector<HTMLButtonElement>("[data-finance-master-trigger]")!;
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(harness.api.listFinanceNominals).not.toHaveBeenCalled();
    act(() => disclosure.click());
    await settle();
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(harness.api.listFinanceNominals).toHaveBeenCalledWith(expect.stringContaining("section_id=section-cash"));
    act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Open")!.click());
    expect(open).toHaveBeenCalledWith("nominal-1");
    act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Edit")!.click());
    expect(edit).toHaveBeenCalledWith("company-1", "section-cash", "section");
    act(() => disclosure.click());
    expect(container.textContent).not.toContain("Main Bank Account");
  });

  it("retries a failed Section expansion without retaining a failed cache entry", async () => {
    harness.api.listFinanceNominals.mockRejectedValueOnce(new Error("Temporary failure"));
    await act(async () =>
      root.render(
        <FinanceSections onCreate={vi.fn()} onEdit={vi.fn()} onOpenNominal={vi.fn()} onStandardChart={vi.fn()} />,
      ),
    );
    await settle();
    act(() => container.querySelector<HTMLButtonElement>("[data-finance-master-trigger]")!.click());
    await settle();
    expect(container.textContent).toContain("Nominals could not be loaded");
    act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")!.click());
    await settle();
    expect(harness.api.listFinanceNominals).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Main Bank Account");
    expect(container.textContent).not.toContain("Nominals could not be loaded");
  });

  it("ignores the previous company's pending Nominal expansion", async () => {
    const options = await harness.api.listFinanceNominalOptions();
    harness.api.listFinanceNominalOptions.mockResolvedValue({
      ...options,
      companies: [...options.companies, { id: "company-2", code: "C2", name: "Second Company" }],
    });
    let resolveOld!: (value: unknown) => void;
    harness.api.listFinanceNominals
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce({
        items: [{ id: "new-nominal", code: "230902", name: "New company nominal", state: "active", currency: "PKR" }],
        next_cursor: null,
      });
    await act(async () =>
      root.render(
        <FinanceSections onCreate={vi.fn()} onEdit={vi.fn()} onOpenNominal={vi.fn()} onStandardChart={vi.fn()} />,
      ),
    );
    await settle();
    act(() => container.querySelector<HTMLButtonElement>("[data-finance-master-trigger]")!.click());
    const company = container.querySelector<HTMLSelectElement>('[aria-label="Hierarchy company"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(company, "company-2");
      company.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    act(() => container.querySelector<HTMLButtonElement>("[data-finance-master-trigger]")!.click());
    await settle();
    await act(async () =>
      resolveOld({
        items: [{ id: "old-nominal", code: "230901", name: "Old company nominal", state: "active", currency: "PKR" }],
        next_cursor: null,
      }),
    );
    expect(container.textContent).toContain("New company nominal");
    expect(container.textContent).not.toContain("Old company nominal");
  });

  it("creates a new Category from its separate form without posting", async () => {
    const saved = vi.fn();
    await act(async () =>
      root.render(
        <FinanceHierarchyForm
          kind="category"
          recordRef={encodeHierarchyRouteReference({ companyId: "company-1" })}
          onSaved={saved}
          onCancel={vi.fn()}
        />,
      ),
    );
    await settle();
    const code = container.querySelector<HTMLInputElement>("#hierarchy-code")!;
    expect(code.readOnly).toBe(true);
    expect(code.value).toBe("CAT-### · Generated when you save");
    change("hierarchy-name", "Receivable Assets");
    change("hierarchy-type", "asset");
    const create = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Save Draft"),
    )!;
    await act(async () => create.click());
    await settle();

    expect(harness.api.createFinanceHierarchy).toHaveBeenCalledWith(
      {
        company_id: "company-1",
        name: "Receivable Assets",
        type: "asset",
      },
      "synthetic-csrf",
      expect.any(String),
    );
    expect(saved).toHaveBeenCalledOnce();
  });

  it("inherits the Category accounting type and requests an automatic Section code", async () => {
    harness.api.createFinanceHierarchy.mockResolvedValue(section);
    await act(async () =>
      root.render(
        <FinanceHierarchyForm
          kind="section"
          recordRef={encodeHierarchyRouteReference({ companyId: "company-1" })}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      ),
    );
    await settle();
    change("hierarchy-parent", category.id);
    change("hierarchy-name", "Short-term Receivables");
    const code = container.querySelector<HTMLInputElement>("#hierarchy-code")!;
    expect(code.readOnly).toBe(true);
    expect(code.value).toBe("Generated from Category when you save");
    const create = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Save Draft"),
    )!;
    await act(async () => create.click());
    await settle();

    expect(harness.api.createFinanceHierarchy).toHaveBeenCalledWith(
      {
        company_id: "company-1",
        name: "Short-term Receivables",
        type: "asset",
        parent_id: category.id,
      },
      "synthetic-csrf",
      expect.any(String),
    );
  });
  it.each(["category", "section"] as const)(
    "opens pending %s details read-only and approves only through the review button",
    async (kind) => {
      const item = {
        ...(kind === "category" ? category : section),
        status: "inactive",
        state: "pending_approval",
        self_decision_requires_override: true,
      };
      harness.api.listFinanceHierarchy.mockResolvedValue({
        items: kind === "category" ? [item] : [category, item],
        next_cursor: null,
      });
      const saved = vi.fn(),
        close = vi.fn();
      await act(async () =>
        root.render(
          <FinanceHierarchyForm
            kind={kind}
            recordRef={encodeHierarchyRouteReference({ companyId: "company-1", headerId: item.id })}
            onSaved={saved}
            onCancel={close}
          />,
        ),
      );
      await settle();
      expect((container.querySelector("#hierarchy-name") as HTMLInputElement).value).toBe(item.name);
      expect((container.querySelector("#hierarchy-name") as HTMLInputElement).disabled).toBe(true);
      expect(container.textContent).toContain("pending approval");
      expect(container.textContent).toContain("Super-admin override");
      const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Approve & Close")!;
      expect(harness.api.changeFinanceHierarchy).not.toHaveBeenCalled();
      await act(async () => button.click());
      await settle();
      expect(harness.api.changeFinanceHierarchy).toHaveBeenCalledWith(
        item.id,
        "company-1",
        { expected_version: item.version, action: "approve" },
        "synthetic-csrf",
        expect.any(String),
      );
      expect(saved).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
    },
  );
  it("keeps failed approval reviews open with the same retry key and allows Close without a decision", async () => {
    const pending = { ...category, state: "pending_approval", status: "inactive" };
    harness.api.listFinanceHierarchy.mockResolvedValue({ items: [pending], next_cursor: null });
    harness.api.changeFinanceHierarchy.mockRejectedValue(new Error("Synthetic approval failure"));
    const saved = vi.fn(),
      close = vi.fn();
    await act(async () =>
      root.render(
        <FinanceHierarchyForm
          kind="category"
          recordRef={encodeHierarchyRouteReference({ companyId: "company-1", headerId: category.id })}
          onSaved={saved}
          onCancel={close}
        />,
      ),
    );
    await settle();
    const approve = [...container.querySelectorAll("button")].find((b) => b.textContent === "Approve & Close")!;
    await act(async () => approve.click());
    await settle();
    await act(async () => approve.click());
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(harness.api.changeFinanceHierarchy.mock.calls[0][4]).toBe(
      harness.api.changeFinanceHierarchy.mock.calls[1][4],
    );
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Close")!.click());
    expect(close).toHaveBeenCalledOnce();
    expect(harness.api.changeFinanceHierarchy).toHaveBeenCalledTimes(2);
  });
  it("submits a saved draft without activating it and prevents submission of unsaved edits", async () => {
    harness.canApprove = false;
    const draft = { ...category, state: "draft", status: "inactive" };
    harness.api.listFinanceHierarchy.mockResolvedValue({ items: [draft], next_cursor: null });
    const saved = vi.fn();
    await act(async () =>
      root.render(
        <FinanceHierarchyForm
          kind="category"
          recordRef={encodeHierarchyRouteReference({ companyId: "company-1", headerId: category.id })}
          onSaved={saved}
          onCancel={vi.fn()}
        />,
      ),
    );
    await settle();
    const submit = [...container.querySelectorAll("button")].find((b) => b.textContent === "Submit for approval")!;
    expect(submit.disabled).toBe(false);
    expect(container.textContent).not.toContain("Activate category");
    await act(async () => submit.click());
    await settle();
    expect(harness.api.changeFinanceHierarchy).toHaveBeenCalledWith(
      category.id,
      "company-1",
      { expected_version: category.version, action: "submit" },
      "synthetic-csrf",
      expect.any(String),
    );
    change("hierarchy-name", "Unsaved change");
    expect(submit.disabled).toBe(true);
  });
  it.each(["category", "section"] as const)(
    "approves a draft %s from the creation form and resumes a failed decision without resubmission",
    async (kind) => {
      const draft = { ...(kind === "category" ? category : section), state: "draft", status: "inactive" };
      const pending = { ...draft, state: "pending_approval", version: draft.version + 1 };
      harness.api.listFinanceHierarchy.mockResolvedValue({
        items: kind === "category" ? [draft] : [category, draft],
        next_cursor: null,
      });
      harness.api.changeFinanceHierarchy
        .mockResolvedValueOnce(pending)
        .mockRejectedValueOnce(new Error("Synthetic decision failure"))
        .mockResolvedValueOnce({ ...pending, state: "active", status: "active", version: pending.version + 1 });
      const saved = vi.fn();
      await act(async () =>
        root.render(
          <FinanceHierarchyForm
            kind={kind}
            recordRef={encodeHierarchyRouteReference({ companyId: "company-1", headerId: draft.id })}
            onSaved={saved}
            onCancel={vi.fn()}
          />,
        ),
      );
      await settle();
      const approve = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Approve & Close")!;
      expect(container.textContent).not.toContain("Submit for approval");
      await act(async () => approve().click());
      await settle();
      expect(saved).not.toHaveBeenCalled();
      expect(harness.api.changeFinanceHierarchy.mock.calls[0][2]).toEqual({
        expected_version: draft.version,
        action: "submit",
      });
      expect(harness.api.changeFinanceHierarchy.mock.calls[1][2]).toEqual({
        expected_version: pending.version,
        action: "approve",
      });
      await act(async () => approve().click());
      await settle();
      expect(harness.api.changeFinanceHierarchy.mock.calls[2][2]).toEqual({
        expected_version: pending.version,
        action: "approve",
      });
      expect(harness.api.changeFinanceHierarchy.mock.calls[2][4]).toBe(
        harness.api.changeFinanceHierarchy.mock.calls[1][4],
      );
      expect(saved).toHaveBeenCalledOnce();
    },
  );
  it("requires a rejection reason and keeps decisions hidden without approval permission", async () => {
    const pending = { ...category, state: "pending_approval", status: "inactive" };
    harness.api.listFinanceHierarchy.mockResolvedValue({ items: [pending], next_cursor: null });
    await act(async () =>
      root.render(
        <FinanceHierarchyForm
          kind="category"
          recordRef={encodeHierarchyRouteReference({ companyId: "company-1", headerId: category.id })}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      ),
    );
    await settle();
    const reject = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reject & Close")!;
    expect(reject.disabled).toBe(true);
    const reason = container.querySelector<HTMLTextAreaElement>("#hierarchy-rejection-reason")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "Reviewed duplicate");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => reject.click());
    await settle();
    expect(harness.api.changeFinanceHierarchy).toHaveBeenCalledWith(
      category.id,
      "company-1",
      { expected_version: category.version, action: "reject", reason: "Reviewed duplicate" },
      "synthetic-csrf",
      expect.any(String),
    );
    harness.canApprove = false;
    await act(async () =>
      root.render(
        <FinanceHierarchyForm
          kind="category"
          recordRef={encodeHierarchyRouteReference({ companyId: "company-1", headerId: category.id })}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).not.toContain("Approve & Close");
    expect(container.textContent).not.toContain("Reject & Close");
  });
});
