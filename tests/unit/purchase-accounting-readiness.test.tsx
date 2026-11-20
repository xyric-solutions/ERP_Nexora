// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purchaseDocumentSchema, subledgerWorkspaceSchema } from "../../packages/contracts/src/index.js";
import { PurchaseAccounting } from "../../app/features/purchasing/components/purchase-accounting.js";

const harness = vi.hoisted(() => ({
  api: { getSubledgerWorkspace: vi.fn(), preparePurchaseAccounting: vi.fn() },
  permissions: ["finance.subledger.read", "finance.subledger.manage"],
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "csrf",
    session: { user: { id: "maker", permissions: harness.permissions } },
  }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const source = purchaseDocumentSchema.parse({
  id: "payment",
  code: "PAY-005",
  company_id: "company",
  kind: "payment",
  supplier_id: "vendor",
  supplier_name: "Existing supplier",
  source_code: null,
  document_date: "2026-11-20",
  currency: "USD",
  state: "approved",
  version: 3,
  total_amount: "3500.00",
  created_by: "maker",
  updated_by: "maker",
  created_at: "2026-11-20",
  updated_at: "2026-11-20",
});
const workspace = () =>
  subledgerWorkspaceSchema.parse({
    company_id: "company",
    base_currency: "USD",
    base_decimal_places: 2,
    as_of: "2026-11-20",
    parties: [],
    policy: null,
    items: [],
    operations: [],
    balances: [],
    accounts: [],
    banks: [],
    currencies: [],
    total_items: 0,
    total_operations: 0,
    total_balances: 0,
    carrying_total: "0",
    unrealized_total: "0",
  });
const policy = {
  company_id: "company",
  version: 1,
  receivable_account_id: "ar",
  payable_account_id: "ap",
  revenue_account_id: "revenue",
  expense_account_id: "expense",
  realized_gain_account_id: "rg",
  realized_loss_account_id: "rl",
  unrealized_gain_account_id: "ug",
  unrealized_loss_account_id: "ul",
};
const supplier = {
  id: "party",
  company_id: "company",
  code: "SUP-001",
  name: "Existing supplier",
  kind: "supplier" as const,
  default_currency: "USD",
  source_supplier_id: "vendor",
};
let root: Root, container: HTMLDivElement;
const setup = vi.fn(),
  review = vi.fn();
async function render(record = source) {
  await act(async () =>
    root.render(<PurchaseAccounting record={record} onSetup={setup} onReview={review} disabled={false} />),
  );
}
function button(text: string) {
  const result = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}
beforeEach(() => {
  vi.resetAllMocks();
  harness.permissions = ["finance.subledger.read", "finance.subledger.manage"];
  harness.api.getSubledgerWorkspace.mockResolvedValue(workspace());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("Purchase accounting prerequisites", () => {
  it("shows the actual missing policy and supplier link with a path to governed setup, without attempting payment", async () => {
    await render();
    expect(container.textContent).toContain("Company control and exchange account mappings");
    expect(container.textContent).toContain("Link 1 existing supplier");
    expect(button("Prepare accounting").disabled).toBe(true);
    await act(async () => button("Open accounting setup").click());
    expect(setup).toHaveBeenCalledOnce();
    expect(harness.api.preparePurchaseAccounting).not.toHaveBeenCalled();
  });
  it("requires every batch supplier link rather than accepting the first supplier only", async () => {
    const data = workspace();
    data.policy = policy;
    data.parties = [supplier];
    harness.api.getSubledgerWorkspace.mockResolvedValue(data);
    await render(
      purchaseDocumentSchema.parse({
        ...source,
        kind: "multi_payment",
        payment_details: {
          bank_account_id: "bank",
          entries: [
            {
              supplier_id: "vendor",
              amount: "100",
              mode: "bank_transfer",
              reference: "first",
              wht_rate: "0",
              additional_wht: "0",
            },
            {
              supplier_id: "second-vendor",
              amount: "100",
              mode: "bank_transfer",
              reference: "second",
              wht_rate: "0",
              additional_wht: "0",
            },
          ],
        },
      }),
    );
    expect(button("Prepare accounting").disabled).toBe(true);
    expect(container.textContent).toContain("Link 1 existing supplier");
  });
  it("prepares an explicit source-linked draft after setup, without posting or changing source amounts", async () => {
    const data = workspace();
    data.policy = policy;
    data.parties = [supplier];
    harness.api.getSubledgerWorkspace.mockResolvedValue(data);
    harness.api.preparePurchaseAccounting.mockResolvedValue({ state: "draft", version: 1, maker_id: "maker" });
    await render();
    expect(button("Prepare accounting").disabled).toBe(false);
    await act(async () => button("Prepare accounting").click());
    expect(harness.api.preparePurchaseAccounting).toHaveBeenCalledWith(
      "payment",
      { company_id: "company", expected_version: 3 },
      "csrf",
      expect.any(String),
    );
    expect(button("Review accounting").disabled).toBe(false);
    await act(async () => button("Review accounting").click());
    expect(review).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Accounting: draft");
  });
  it("allows review of historical linked accounting even if present setup is missing", async () => {
    await render({ ...source, finance_state: "posted", finance_journal_id: "journal" });
    expect(button("Review accounting").disabled).toBe(false);
    expect(container.textContent).toContain("Journal journal");
  });
  it("fails closed on a failed check and reloads prerequisites on retry", async () => {
    harness.api.getSubledgerWorkspace.mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(button("Prepare accounting").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => button("Retry accounting setup check").click());
    expect(harness.api.getSubledgerWorkspace).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Company control and exchange account mappings");
  });
  it("does not offer mutation or run finance reads to a user without Finance management authority", async () => {
    harness.permissions = [];
    await render();
    expect(harness.api.getSubledgerWorkspace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("assign Finance subledger");
    expect([...container.querySelectorAll("button")]).toHaveLength(0);
  });
});
