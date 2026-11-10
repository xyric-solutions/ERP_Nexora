// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supplierInputSchema } from "../../packages/contracts/src/index.js";
import { PurchaseSuppliers } from "../../app/features/purchasing/components/purchase-suppliers.js";

const harness = vi.hoisted(() => ({
  api: { savePurchaseSupplier: vi.fn(), listPurchaseSuppliers: vi.fn() },
  permissions: ["procurement.vendor.create"],
  impersonation: false,
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "csrf",
    session: { user: { permissions: harness.permissions }, impersonation: harness.impersonation ? {} : undefined },
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => vi.fn() }));
let root: Root, container: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = {
  company: "company",
  suppliers: [],
  canLoadMore: false,
  onMore: vi.fn(),
  busy: false,
  onSaved: vi.fn(),
  onDirtyChange: vi.fn(),
};
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => button.click());
}
function control(label: string) {
  const field = [...container.querySelectorAll("label")].find((item) => item.textContent === label);
  const element = field && document.getElementById(field.htmlFor);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input ${label}`);
  return element;
}
function fill(label: string, value: string) {
  const element = control(label);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.permissions = ["procurement.vendor.create"];
  harness.impersonation = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.api.savePurchaseSupplier.mockImplementation(async (_id, input) => ({
    record: { ...input, code: "SUP-001", id: "supplier-one", version: 1, risk_status: "normal" },
    audit_event_id: "audit",
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Detailed supplier form", () => {
  it("calls the close callback only after cancelling, never while opening the editor", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(<PurchaseSuppliers {...props} onClose={onClose} />));
    await click("Add Supplier");
    expect(onClose).not.toHaveBeenCalled();
    await click("Cancel");
    expect(onClose).toHaveBeenCalledOnce();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });
  it("opens the direct creation route and saves profile values across tabs", async () => {
    await act(async () => root.render(<PurchaseSuppliers {...props} initialCreate />));
    expect(control("Supplier code").readOnly).toBe(true);
    fill("Supplier name *", "Synthetic supplier");
    await click("Contacts & Addresses");
    fill("Contact full name", "Synthetic buyer");
    fill("Email", "buyer@example.invalid");
    await click("Bank Accounts");
    await click("Add Bank Account");
    fill("Bank name *", "Synthetic Bank");
    fill("Account title *", "Synthetic supplier");
    fill("Account number", "12345678");
    await save();
    expect(harness.api.savePurchaseSupplier).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        name: "Synthetic supplier",
        email: "buyer@example.invalid",
        profile: expect.objectContaining({
          contact_name: "Synthetic buyer",
          bank_accounts: [
            expect.objectContaining({ bank_name: "Synthetic Bank", account_number: "12345678", is_default: true }),
          ],
        }),
      }),
      "csrf",
      expect.any(String),
    );
    expect(props.onSaved).toHaveBeenCalledOnce();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(container.querySelector("form")).toBeNull();
  });
  it("opens the invalid field's tab and keeps unsaved values when validation fails", async () => {
    await act(async () => root.render(<PurchaseSuppliers {...props} initialCreate />));
    fill("Supplier name *", "Synthetic supplier");
    await click("Contacts & Addresses");
    fill("Email", "invalid");
    await click("Internal Notes");
    await save();
    expect(control("Email").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(control("Email"));
    expect(harness.api.savePurchaseSupplier).not.toHaveBeenCalled();
    await click("Overview");
    expect(control("Supplier name *").value).toBe("Synthetic supplier");
  });
  it("preserves supplier code, version and bank details during an edit and retry", async () => {
    const input = supplierInputSchema.parse({
      company_id: "company",
      name: "Existing",
      profile: {
        bank_accounts: [
          {
            id: "bank-one",
            bank_name: "Existing Bank",
            account_title: "Existing",
            account_number: "123",
            is_default: true,
          },
        ],
      },
    });
    await act(async () =>
      root.render(
        <PurchaseSuppliers
          {...props}
          suppliers={[{ ...input, id: "one", code: "SUP-097", version: 7, risk_status: "normal" }]}
        />,
      ),
    );
    await click("Edit SUP-097");
    expect(control("Supplier code").value).toBe("SUP-097");
    fill("Trading / display name", "Updated name");
    harness.api.savePurchaseSupplier.mockRejectedValueOnce(new Error("Temporary error"));
    await save();
    await save();
    expect(harness.api.savePurchaseSupplier.mock.calls[1]).toEqual(harness.api.savePurchaseSupplier.mock.calls[0]);
    expect(harness.api.savePurchaseSupplier.mock.calls[0]?.[1]).toMatchObject({
      expected_version: 7,
      profile: { trading_name: "Updated name", bank_accounts: [{ bank_name: "Existing Bank" }] },
    });
  });
  it("reassigns the default when its bank account is removed", async () => {
    await act(async () => root.render(<PurchaseSuppliers {...props} initialCreate />));
    fill("Supplier name *", "Synthetic");
    await click("Bank Accounts");
    await click("Add Bank Account");
    await click("Add Bank Account");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove bank account 1"]')!.click());
    fill("Bank name *", "Second");
    fill("Account title *", "Second");
    fill("Account number", "222");
    await save();
    expect(harness.api.savePurchaseSupplier.mock.calls[0]?.[1].profile.bank_accounts).toEqual([
      expect.objectContaining({ bank_name: "Second", is_default: true }),
    ]);
  });
  it("protects dirty forms and blocks writes without permission or during impersonation", async () => {
    await act(async () => root.render(<PurchaseSuppliers {...props} initialCreate />));
    fill("Supplier name *", "Unsaved");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await click("Cancel");
    expect(confirm).toHaveBeenCalled();
    expect(container.querySelector("form")).toBeTruthy();
    harness.impersonation = true;
    await act(async () => root.render(<PurchaseSuppliers {...props} initialCreate />));
    await save();
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(harness.api.savePurchaseSupplier).not.toHaveBeenCalled();
    harness.impersonation = false;
    harness.permissions = [];
    await act(async () => root.render(<PurchaseSuppliers {...props} initialCreate />));
    await save();
    expect(harness.api.savePurchaseSupplier).not.toHaveBeenCalled();
  });
});
