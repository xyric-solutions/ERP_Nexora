// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../app/lib/api/generated.js";
import { PurchaseDocumentForm } from "../../app/features/purchasing/components/purchase-document-form.js";
const harness = vi.hoisted(() => ({
  api: {
    getPurchaseDocument: vi.fn(),
    getPurchaseFlow: vi.fn(),
    listPurchaseDocuments: vi.fn(),
    savePurchaseDocument: vi.fn(),
    actOnPurchaseDocument: vi.fn(),
    listPurchaseProducts: vi.fn(),
    listPurchaseApprovers: vi.fn(),
    listPurchaseSuppliers: vi.fn(),
  },
  permissions: [
    "procurement.document.read",
    "procurement.document.create",
    "procurement.document.action",
    "procurement.document.submit",
    "procurement.document.approve",
  ],
  roles: ["purchase_maker"],
  impersonation: false,
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "test-csrf",
    session: {
      user: { id: "maker", permissions: harness.permissions, roles: harness.roles },
      impersonation: harness.impersonation ? {} : undefined,
    },
  }),
}));
let root: Root, container: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const record = () => ({
  id: "purchase-one",
  company_id: "company-one",
  kind: "request",
  code: "PRQ-001",
  supplier_id: null,
  source_id: null,
  invited_supplier_ids: [],
  document_date: "2026-11-05",
  due_date: null,
  currency: "USD",
  reference: "",
  notes: "",
  lines: [
    {
      id: "line-one",
      source_line_id: null,
      item_code: "",
      description: "Synthetic product",
      quantity: "1",
      uom: "Each",
      unit_price: "10.00",
      tax_percent: "0",
    },
  ],
  allocations: [],
  state: "draft",
  version: 1,
  total_amount: "10.00",
  created_by: "maker",
  updated_by: "maker",
  created_at: "2026-11-05T00:00:00Z",
  updated_at: "2026-11-05T00:00:00Z",
  supplier_name: null,
  source_code: null,
  reserved_amount: "0.00",
  events: [],
});
const props = {
  company: "company-one",
  kind: "request" as const,
  options: { currencies: [{ code: "USD", name: "US Dollar" }], execution_mode: "instruction_only" as const },
  suppliers: [],
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  onDirtyChange: vi.fn(),
};
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function change(label: string, value: string) {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing ${label}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.permissions.splice(
    0,
    harness.permissions.length,
    "procurement.document.read",
    "procurement.document.create",
    "procurement.document.action",
    "procurement.document.submit",
    "procurement.document.approve",
  );
  harness.roles = ["purchase_maker"];
  harness.impersonation = false;
  harness.api.listPurchaseDocuments.mockResolvedValue({ items: [], next_cursor: null });
  harness.api.listPurchaseProducts.mockResolvedValue({ items: [], next_cursor: null });
  harness.api.listPurchaseApprovers.mockResolvedValue({ items: [], next_cursor: null });
  harness.api.listPurchaseSuppliers.mockResolvedValue({ items: [], next_cursor: null });
  harness.api.getPurchaseFlow.mockResolvedValue({
    root_id: "purchase-one",
    root_code: "PRQ-001",
    items: [record()],
    stages: [{ kind: "request", total: 1, draft: 1, submitted: 0, approved: 0, rejected: 0, cancelled: 0 }],
    next_cursor: null,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("Persisted Purchase creation and approval form", () => {
  it("reopens bill dates, recalculates terms from bill date and saves manual due dates", async () => {
    const invoice = {
      ...record(),
      kind: "bill",
      supplier_id: "supplier-a",
      supplier_name: "Supplier A",
      reference: "INV-1",
      bill_date: "2026-11-01",
      payment_term: "days_15",
      due_date: "2026-11-16",
    };
    harness.api.getPurchaseDocument.mockResolvedValue(invoice);
    harness.api.savePurchaseDocument.mockResolvedValue({ record: { ...invoice, version: 2 } });
    await act(async () => root.render(<PurchaseDocumentForm {...props} kind="bill" reference="purchase-one" />));
    await settle();
    function field(label: string) {
      const element = [...container.querySelectorAll("label")].find((item) => item.textContent === label)!;
      return container.querySelector(`[id="${element.htmlFor}"]`)!;
    }
    expect(field("Document date *")).toHaveProperty("value", "2026-11-05");
    expect(field("Bill date *")).toHaveProperty("value", "2026-11-01");
    act(() => {
      const term = field("Payment term") as HTMLSelectElement;
      term.value = "days_30";
      term.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(field("Due date")).toHaveProperty("value", "2026-12-01");
    expect(field("Due date")).toHaveProperty("readOnly", true);
    await click("Save Draft");
    expect(harness.api.savePurchaseDocument.mock.calls[0][1]).toMatchObject({
      bill_date: "2026-11-01",
      payment_term: "days_30",
      due_date: "2026-12-01",
    });
    act(() => {
      const term = field("Payment term") as HTMLSelectElement;
      term.value = "";
      term.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(field("Due date")).toHaveProperty("readOnly", false);
    act(() => {
      const term = field("Payment term") as HTMLSelectElement;
      term.value = "percent_30_now_balance_60_days";
      term.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="Bill payment schedule"]')?.textContent).toContain("3.00 USD");
    expect(container.querySelector('[aria-label="Bill payment schedule"]')?.textContent).toContain("7.00 USD");
    act(() => {
      const term = field("Payment term") as HTMLSelectElement;
      term.value = "";
      term.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Save Draft");
    expect(harness.api.savePurchaseDocument.mock.calls.at(-1)![1].payment_term).toBeNull();
  });
  it("reopens saved bank, method and WHT details and persists changes with discounts", async () => {
    const bill = {
      ...record(),
      id: "bill-one",
      code: "BILL-001",
      kind: "bill",
      state: "approved",
      supplier_id: "supplier-a",
      supplier_name: "Supplier A",
      total_amount: "100.00",
    };
    const payment = {
      ...record(),
      kind: "payment",
      supplier_id: "supplier-a",
      supplier_name: "Supplier A",
      lines: [],
      allocations: [{ bill_id: bill.id, amount: "75.00", discount: "5.00" }],
      payment_details: {
        bank_account_id: "bank-one",
        bank_account_name: "Operating bank",
        account_number_masked: "•••• 1234",
        entries: [
          {
            supplier_id: "supplier-a",
            amount: "100.00",
            mode: "cheque",
            reference: "CHQ-01",
            wht_rate: "2.5",
            additional_wht: "1.00",
            mailing_address: "Saved mailing address",
          },
        ],
      },
    };
    harness.api.getPurchaseDocument.mockImplementation(async (id: string) => (id === bill.id ? bill : payment));
    harness.api.savePurchaseDocument.mockResolvedValue({ record: { ...payment, version: 2 } });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          kind="payment"
          reference="purchase-one"
          options={{
            ...props.options,
            bank_accounts: [
              { id: "bank-one", account_name: "Operating bank", account_number_masked: "•••• 1234", currency: "USD" },
            ],
          }}
        />,
      ),
    );
    await settle();
    expect(container.textContent).toContain("Operating bank");
    expect(container.querySelector("textarea[readonly]")?.textContent).toBe("Saved mailing address");
    expect(container.querySelector('[aria-label="Unallocated balance 1"]')).toHaveProperty("value", "25.00");
    expect(container.textContent).toContain("Net bank amount: 96.50");
    change("WHT rate 1", "5");
    change("Additional WHT 1", "2.00");
    change("Discount BILL-001", "4.00");
    await click("Save Draft");
    expect(harness.api.savePurchaseDocument.mock.calls[0][1]).toMatchObject({
      allocations: [{ bill_id: bill.id, amount: "75.00", discount: "4.00" }],
      payment_details: {
        bank_account_id: "bank-one",
        entries: [{ mode: "cheque", wht_rate: "5", additional_wht: "2.00" }],
      },
    });
  });
  it("inherits the PR approver through an older RFQ without showing another selector", async () => {
    harness.api.getPurchaseDocument.mockResolvedValue({
      ...record(),
      kind: "rfq",
      state: "approved",
      approver_id: "old-checker",
      supplier_id: "supplier-a",
      invited_supplier_ids: ["supplier-a"],
      request_approver_id: "maker",
      request_approver_name: "Maker",
    });
    harness.api.savePurchaseDocument.mockResolvedValue({
      record: { ...record(), kind: "order", approver_id: "maker" },
    });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          kind="order"
          reference="from:purchase-one"
          options={{ ...props.options, can_self_approve: true }}
        />,
      ),
    );
    await settle();
    expect(container.querySelector('[aria-label="Purchase approver"]')).toBeNull();
    expect(container.textContent).toContain("Save, Approve & Continue");
    await click("Save Draft");
    expect(harness.api.savePurchaseDocument.mock.calls[0][1].approver_id).toBe("maker");
  });
  it.each(["request", "payment", "multi_payment"] as const)(
    "asks for a %s rejection reason only after Reject and requires confirmation",
    async (kind) => {
      const pending = {
        ...record(),
        kind,
        state: "submitted",
        version: 2,
        created_by: "another-maker",
        approver_id: "maker",
      };
      harness.api.getPurchaseDocument.mockResolvedValue(pending);
      harness.api.actOnPurchaseDocument.mockResolvedValue({ record: { ...pending, state: "rejected", version: 3 } });
      await act(async () => root.render(<PurchaseDocumentForm {...props} kind={kind} reference="purchase-one" />));
      await settle();
      expect(container.textContent).not.toContain("Reason for rejection");
      await click("Reject");
      expect(harness.api.actOnPurchaseDocument).not.toHaveBeenCalled();
      const label = [...container.querySelectorAll("label")].find(
        (item) => item.textContent === "Reason for rejection *",
      )!;
      const reason = container.querySelector(`[id="${label.htmlFor}"]`);
      if (!(reason instanceof HTMLInputElement)) throw new Error("Missing rejection reason");
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reason, "Incorrect quantities");
        reason.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await click("Confirm rejection");
      expect(harness.api.actOnPurchaseDocument.mock.calls[0][1]).toMatchObject({
        action: "reject",
        reason: "Incorrect quantities",
      });
    },
  );
  it("requires a supplier before saving a new RFQ", async () => {
    await act(async () => root.render(<PurchaseDocumentForm {...props} kind="rfq" />));
    await click("Save Draft");
    expect(container.textContent).toContain("Select a supplier for the Request for Quotation.");
    expect(harness.api.savePurchaseDocument).not.toHaveBeenCalled();
  });
  it("preserves historical multi-supplier RFQs during unrelated edits", async () => {
    const draft = { ...record(), kind: "rfq", code: "RFQ-001", invited_supplier_ids: ["supplier-a", "supplier-b"] };
    harness.api.getPurchaseDocument.mockResolvedValue(draft);
    harness.api.savePurchaseDocument.mockResolvedValue({ record: draft });
    await act(async () => root.render(<PurchaseDocumentForm {...props} kind="rfq" reference="purchase-one" />));
    await settle();
    expect(container.textContent).toContain("Saved suppliers: supplier-a, supplier-b");
    expect(container.textContent).not.toContain("Invite suppliers");
    expect(container.textContent).not.toContain("Search approved source records");
    change("Line 1 description", "Updated description");
    await click("Save Draft");
    expect(harness.api.savePurchaseDocument.mock.calls[0][1]).toMatchObject({
      supplier_id: null,
      invited_supplier_ids: ["supplier-a", "supplier-b"],
    });
  });
  it("carries the sole supplier of a historical RFQ into its Order", async () => {
    harness.api.getPurchaseDocument.mockResolvedValue({
      ...record(),
      kind: "rfq",
      code: "RFQ-001",
      state: "approved",
      invited_supplier_ids: ["supplier-a"],
    });
    await act(async () => root.render(<PurchaseDocumentForm {...props} kind="order" reference="from:purchase-one" />));
    await settle();
    const label = [...container.querySelectorAll("label")].find((item) => item.textContent === "Supplier *")!;
    const supplier = container.querySelector(`[id="${label.htmlFor}"]`);
    expect(supplier).toBeInstanceOf(HTMLSelectElement);
    if (!(supplier instanceof HTMLSelectElement)) throw new Error("Missing Order supplier");
    expect(supplier.value).toBe("supplier-a");
    expect(supplier.disabled).toBe(true);
  });
  it("keeps submission to another approver in the same workspace", async () => {
    const draft = { ...record(), approver_id: "checker", approver_name: "Checker" };
    harness.api.getPurchaseDocument.mockResolvedValue(draft);
    harness.api.actOnPurchaseDocument.mockResolvedValue({
      record: { ...draft, state: "submitted", version: 2 },
      audit_event_id: "audit-two",
    });
    await act(async () => root.render(<PurchaseDocumentForm {...props} reference="purchase-one" />));
    await settle();
    await click("Save & Continue");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Awaiting approval from Checker");
    expect(container.querySelector('section[aria-label="Purchase workflow progress"]')).toBeTruthy();
  });
  it("approves the final bill without sending the user back to a register", async () => {
    const pending = {
      ...record(),
      kind: "bill",
      code: "BILL-001",
      state: "submitted",
      approver_id: "maker",
      created_by: "another-maker",
      version: 2,
    };
    harness.api.getPurchaseDocument.mockResolvedValue(pending);
    harness.api.actOnPurchaseDocument.mockResolvedValue({
      record: { ...pending, state: "approved", version: 3 },
      audit_event_id: "audit-three",
    });
    await act(async () => root.render(<PurchaseDocumentForm {...props} kind="bill" reference="purchase-one" />));
    await settle();
    expect(container.textContent).not.toContain("Approval / action reason");
    expect(container.querySelector('[aria-label="Purchase approver"]')).toBeNull();
    await click("Approve Bill");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Document status"] [aria-current="step"]')?.textContent).toBe(
      "Approved",
    );
  });
  it("requires an assigned approver before Save & Continue without saving an incomplete workflow", async () => {
    await act(async () => root.render(<PurchaseDocumentForm {...props} />));
    change("Line 1 description", "Custom service");
    await click("Save & Continue");
    expect(container.textContent).toContain("Select an approver before continuing.");
    expect(harness.api.savePurchaseDocument).not.toHaveBeenCalled();
  });
  it("keeps Submit for Approval separate from the explicit same-user approval action", async () => {
    const draft = { ...record(), approver_id: "maker", approver_name: "Maker" };
    harness.api.getPurchaseDocument.mockResolvedValue(draft);
    harness.api.actOnPurchaseDocument.mockResolvedValue({
      record: { ...draft, state: "submitted", version: 2 },
      audit_event_id: "audit-two",
    });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          options={{ ...props.options, can_self_approve: true }}
          reference="purchase-one"
        />,
      ),
    );
    await settle();
    await click("Submit for Approval");
    expect(harness.api.actOnPurchaseDocument.mock.calls.map((call) => call[1].action)).toEqual(["submit"]);
    expect(props.onNavigate).not.toHaveBeenCalled();
  });
  it("opens the next linked form only after an explicit authorized approval", async () => {
    const submitted = { ...record(), approver_id: "maker", state: "submitted", version: 2 };
    harness.api.getPurchaseDocument.mockResolvedValue(submitted);
    harness.api.actOnPurchaseDocument.mockResolvedValue({
      record: { ...submitted, state: "approved", version: 3 },
      audit_event_id: "audit-three",
    });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          options={{ ...props.options, can_self_approve: true }}
          reference="review:purchase-one"
        />,
      ),
    );
    await settle();
    expect(harness.api.getPurchaseDocument).toHaveBeenCalledWith("purchase-one", "company-one");
    await click("Approve & Continue");
    expect(props.onNavigate).toHaveBeenCalledWith("add-rfq", "from:purchase-one");
    expect(harness.api.actOnPurchaseDocument).toHaveBeenCalledOnce();
    expect(harness.api.actOnPurchaseDocument.mock.calls[0][1].reason).toBe("");
  });
  it("submits and approves in one explicit action, retaining the submission and retry key if approval fails", async () => {
    const draft = { ...record(), approver_id: "maker" };
    const submitted = { ...draft, state: "submitted", version: 2 };
    harness.api.getPurchaseDocument.mockResolvedValue(draft);
    harness.api.savePurchaseDocument.mockResolvedValue({ record: draft });
    harness.api.actOnPurchaseDocument
      .mockResolvedValueOnce({ record: submitted })
      .mockRejectedValueOnce(new ApiError(503, "Approval temporarily unavailable", "UNAVAILABLE"))
      .mockResolvedValueOnce({ record: { ...submitted, state: "approved", version: 3 } });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          options={{ ...props.options, can_self_approve: true }}
          reference="purchase-one"
        />,
      ),
    );
    await settle();
    change("Line 1 description", "Updated synthetic product");
    await click("Save, Approve & Continue");
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Approval temporarily unavailable");
    await click("Approve & Continue");
    const calls = harness.api.actOnPurchaseDocument.mock.calls;
    expect(calls.map((call) => call[1].action)).toEqual(["submit", "approve", "approve"]);
    expect(calls[2]).toEqual(calls[1]);
    expect(harness.api.savePurchaseDocument).toHaveBeenCalledOnce();
    expect(props.onNavigate).toHaveBeenCalledWith("add-rfq", "from:purchase-one");
  });
  it("allows authorized Super Admin self-approval without a reason field", async () => {
    harness.roles = ["super_administrator"];
    harness.permissions.push("platform.approval.override");
    const pending = {
      ...record(),
      approver_id: "maker",
      state: "submitted",
      version: 2,
    };
    harness.api.getPurchaseDocument.mockResolvedValue(pending);
    harness.api.actOnPurchaseDocument.mockResolvedValue({ record: { ...pending, state: "approved", version: 3 } });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          options={{ ...props.options, can_self_approve: true }}
          reference="purchase-one"
        />,
      ),
    );
    await settle();
    expect(
      [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Approve & Continue")
        ?.disabled,
    ).toBe(false);
    expect(container.textContent).not.toContain("Approval / action reason");
    expect(container.textContent).not.toContain("Enter an approval reason");
    await click("Approve & Continue");
    expect(harness.api.actOnPurchaseDocument.mock.calls[0][1]).toMatchObject({ action: "approve", reason: "" });
  });
  it.each([
    ["payment", false],
    ["multi_payment", false],
    ["payment", true],
    ["multi_payment", true],
  ] as const)("approves %s without a reason (Super Admin: %s)", async (kind, admin) => {
    if (admin) {
      harness.roles = ["super_administrator"];
      harness.permissions.push("platform.approval.override");
    }
    const pending = {
      ...record(),
      kind,
      approver_id: "maker",
      state: "submitted",
      version: 2,
    };
    harness.api.getPurchaseDocument.mockResolvedValue(pending);
    harness.api.actOnPurchaseDocument.mockResolvedValue({ record: { ...pending, state: "approved", version: 3 } });
    await act(async () =>
      root.render(
        <PurchaseDocumentForm
          {...props}
          kind={kind}
          options={{ ...props.options, can_self_approve: !admin }}
          reference="purchase-one"
        />,
      ),
    );
    await settle();
    expect(
      [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Approve")?.disabled,
    ).toBe(false);
    expect(container.textContent).not.toContain("Approval / action reason");
    expect(container.textContent).not.toContain("Enter an approval reason");
    expect(container.textContent).not.toContain("Super-admin override");
    await click("Approve");
    expect(harness.api.actOnPurchaseDocument.mock.calls[0][1]).toMatchObject({ action: "approve", reason: "" });
  });
  it("asks for a payment cancellation reason only after Cancel record", async () => {
    const pending = { ...record(), kind: "payment", state: "submitted", version: 2 };
    harness.api.getPurchaseDocument.mockResolvedValue(pending);
    harness.api.actOnPurchaseDocument.mockResolvedValue({ record: { ...pending, state: "cancelled", version: 3 } });
    await act(async () => root.render(<PurchaseDocumentForm {...props} kind="payment" reference="purchase-one" />));
    await settle();
    expect(container.textContent).not.toContain("Reason for cancellation");
    await click("Cancel record");
    const label = [...container.querySelectorAll("label")].find(
      (item) => item.textContent === "Reason for cancellation *",
    )!;
    const reason = container.querySelector(`[id="${label.htmlFor}"]`);
    if (!(reason instanceof HTMLInputElement)) throw new Error("Missing cancellation reason");
    expect(
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm cancellation")
        ?.disabled,
    ).toBe(true);
    expect(harness.api.actOnPurchaseDocument).not.toHaveBeenCalled();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reason, "Duplicate instruction");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Confirm cancellation");
    expect(harness.api.actOnPurchaseDocument.mock.calls[0][1]).toMatchObject({
      action: "cancel",
      reason: "Duplicate instruction",
    });
  });
  it("saves real form values with a generated code and retains the same form", async () => {
    harness.api.savePurchaseDocument.mockResolvedValue({ record: record(), audit_event_id: "audit-one" });
    await act(async () => root.render(<PurchaseDocumentForm {...props} />));
    change("Line 1 description", "Synthetic product");
    change("Line 1 unit price", "10.00");
    await click("Save Draft");
    expect(harness.api.savePurchaseDocument).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        company_id: "company-one",
        kind: "request",
        currency: "USD",
        lines: [expect.objectContaining({ description: "Synthetic product", unit_price: "10.00" })],
      }),
      "test-csrf",
      expect.any(String),
    );
    expect(container.textContent).toContain("PRQ-001");
    expect(container.querySelector('[aria-label="Line 1 description"]')).toBeTruthy();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });
  it("retries a failed submission without creating a second draft or changing the submission key", async () => {
    const saved = record();
    harness.api.savePurchaseDocument.mockResolvedValue({ record: saved, audit_event_id: "audit-one" });
    harness.api.actOnPurchaseDocument
      .mockRejectedValueOnce(new ApiError(503, "Try again", "UNAVAILABLE"))
      .mockResolvedValueOnce({ record: { ...saved, state: "submitted", version: 2 }, audit_event_id: "audit-two" });
    await act(async () => root.render(<PurchaseDocumentForm {...props} />));
    change("Line 1 description", "Synthetic product");
    change("Line 1 unit price", "10.00");
    await click("Submit for Approval");
    expect(container.textContent).toContain("Try again");
    await click("Submit for Approval");
    expect(harness.api.savePurchaseDocument).toHaveBeenCalledTimes(1);
    expect(harness.api.actOnPurchaseDocument).toHaveBeenCalledTimes(2);
    const calls = harness.api.actOnPurchaseDocument.mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
  });
  it("blocks draft creation after a failed persisted-record load and allows a real retry", async () => {
    harness.api.getPurchaseDocument
      .mockRejectedValueOnce(new ApiError(404, "Not found in this company", "NOT_FOUND"))
      .mockResolvedValueOnce(record());
    await act(async () => root.render(<PurchaseDocumentForm {...props} reference="purchase-one" />));
    await settle();
    expect(container.textContent).toContain("Not found in this company");
    expect(container.querySelector("form")).toBeNull();
    expect(harness.api.savePurchaseDocument).not.toHaveBeenCalled();
    await click("Retry loading record");
    expect(container.querySelector("form")).toBeTruthy();
    expect(container.textContent).toContain("PRQ-001");
  });
  it("uses the populated form for independent approval without asking for a reason", async () => {
    const submitted = { ...record(), state: "submitted", version: 2, created_by: "another-maker" };
    harness.api.getPurchaseDocument.mockResolvedValue(submitted);
    harness.api.actOnPurchaseDocument.mockResolvedValue({
      record: { ...submitted, state: "approved", version: 3 },
      audit_event_id: "audit-three",
    });
    await act(async () => root.render(<PurchaseDocumentForm {...props} reference="purchase-one" />));
    await settle();
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    const approve = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve & Close",
    )!;
    expect(approve.disabled).toBe(false);
    expect(container.textContent).not.toContain("Approval / action reason");
    await click("Approve & Close");
    expect(harness.api.actOnPurchaseDocument).toHaveBeenCalledWith(
      "purchase-one",
      { company_id: "company-one", expected_version: 2, action: "approve", reason: "" },
      "test-csrf",
      expect.any(String),
    );
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it("prevents ordinary self-approval and impersonated writes", async () => {
    harness.api.getPurchaseDocument.mockResolvedValue({ ...record(), state: "submitted", version: 2 });
    await act(async () => root.render(<PurchaseDocumentForm {...props} reference="purchase-one" />));
    await settle();
    expect(
      [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Approve & Close")
        ?.disabled,
    ).toBe(true);
    harness.impersonation = true;
    await act(async () => root.render(<PurchaseDocumentForm {...props} reference="purchase-one" />));
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(container.textContent).not.toContain("Approve & Close");
  });
});
