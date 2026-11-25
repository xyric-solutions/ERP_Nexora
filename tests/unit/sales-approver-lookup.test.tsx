// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { salesDocumentInputSchema } from "@nexora/contracts";
import type { SearchableSelectProps } from "../../app/shared/ui/searchable-select";

const harness = vi.hoisted(() => ({
  api: { getSalesLookups: vi.fn(), createSalesDocument: vi.fn() },
  session: { user: { id: "maker", permissions: ["sales.document.read", "sales.document.create"] } },
  selects: new Map<string, SearchableSelectProps>(),
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: harness.api, session: harness.session, csrfToken: () => "csrf" }),
}));
vi.mock("@/shared/ui/searchable-select", async () => {
  const { SearchableSelectDouble } = await import("./searchable-select-double");
  return {
    SearchableSelect: (props: SearchableSelectProps) => {
      harness.selects.set(props.label, props);
      return <SearchableSelectDouble {...props} />;
    },
  };
});
import { PersistentSalesLookup } from "../../app/features/sales/components/persistent-sales-lookup";
import { PersistentSalesForm } from "../../app/features/sales/components/persistent-sales-form";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement, root: Root;
const choice = (id: string) => ({
  id,
  code: id,
  name: id,
  type: "approver",
  currency: null,
  price: null,
  unit: null,
  quantity: null,
  decimal_places: null,
  unit_id: null,
  tax_rate: null,
  financial_configuration: null,
});
beforeEach(() => {
  vi.useFakeTimers();
  harness.api.getSalesLookups.mockResolvedValue({ items: [choice("maker"), choice("reviewer")], total: 2 });
  harness.selects.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function lookup(value = "", onChange = vi.fn()) {
  await act(async () =>
    root.render(
      <PersistentSalesLookup
        company="company"
        kind="approver"
        label="Approver"
        value={value}
        selectedLabel={value}
        onChange={onChange}
      />,
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(150));
}
it("offers explicit creator approval and excludes self even from an outdated API response", async () => {
  await lookup();
  expect(container.textContent).not.toContain("Choose another reviewer");
  expect(container.querySelector("p")).toBeNull();
  const options = harness.selects.get("Approver")!.options;
  expect(options).toContainEqual({ value: "", label: "Creator approval (no reviewer)" });
  expect(options.some((option) => option.value === "maker")).toBe(false);
  expect(options.some((option) => option.value === "reviewer")).toBe(true);
});
it("clears the assigned reviewer for the creator-approval path", async () => {
  const onChange = vi.fn();
  await lookup("reviewer", onChange);
  await act(async () => harness.selects.get("Approver")!.onValueChange(""));
  expect(onChange).toHaveBeenCalledWith(null);
});
it("disables a stale self selection and refuses to reselect it", async () => {
  const onChange = vi.fn();
  await lookup("maker", onChange);
  expect(harness.selects.get("Approver")!.options.find((option) => option.value === "maker")?.disabled).toBe(true);
  await act(async () => harness.selects.get("Approver")!.onValueChange("maker"));
  expect(onChange).not.toHaveBeenCalled();
});
function draft(approver_id: string | null) {
  return salesDocumentInputSchema.parse({
    company_id: "company",
    kind: "quotation",
    customer_id: "customer",
    document_date: "2026-11-23",
    currency: "USD",
    project_id: "project",
    location_id: "location",
    approver_id,
    reference: "",
    notes: "",
    no_tax_reason: "No applicable governed tax",
    lines: [
      {
        product_id: null,
        unit_id: "each",
        description: "Other charge",
        quantity: "1",
        unit_price: "10",
        discount_amount: "0",
        tax_definition_id: null,
        dimensions: {},
      },
    ],
  });
}
it("explains stale self review before sending a save request", async () => {
  await act(async () =>
    root.render(
      <PersistentSalesForm
        company="company"
        kind="quotation"
        initial={draft("maker")}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Choose Creator approval (no reviewer)");
  expect(harness.api.createSalesDocument).not.toHaveBeenCalled();
});
it("sends an unassigned reviewer when saving through creator approval", async () => {
  harness.api.createSalesDocument.mockRejectedValue(new Error("Captured request"));
  await act(async () =>
    root.render(
      <PersistentSalesForm
        company="company"
        kind="quotation"
        initial={draft(null)}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(harness.api.createSalesDocument).toHaveBeenCalledWith(
    expect.objectContaining({ approver_id: null }),
    "csrf",
    expect.any(String),
  );
});
