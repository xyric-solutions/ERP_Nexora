// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsWorkspace } from "../../app/features/inventory/views/products-workspace.js";
import { setActiveCompanyId } from "../../app/lib/session/active-company.js";
const harness = vi.hoisted(() => ({
  api: { listInventoryCompanies: vi.fn(), getInventoryOptions: vi.fn(), listProducts: vi.fn() },
  session: {
    tenant_id: "tenant",
    user: {
      permissions: [
        "inventory.item.read",
        "inventory.item.create",
        "finance.company_currency_profile.read",
        "finance.company_currency.read",
        "finance.company_currency_rate.read",
      ],
    },
  },
}));
vi.mock("@/lib/session/session-provider", () => ({ useSession: () => ({ ...harness, loading: false }) }));
vi.mock("../../app/features/inventory/components/product-form", () => ({
  ProductForm: () => <p>Existing product form</p>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, container: HTMLDivElement;
const navigate = vi.fn();
async function render() {
  await act(async () => root.render(<ProductsWorkspace page="products" onNavigate={navigate} />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}
function add() {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Add New")!;
}
beforeEach(() => {
  vi.resetAllMocks();
  setActiveCompanyId("a");
  harness.api.listInventoryCompanies.mockResolvedValue({
    items: [
      { id: "a", name: "Company A", code: "A" },
      { id: "b", name: "Other company", code: "B" },
    ],
  });
  harness.api.getInventoryOptions.mockResolvedValue({
    currencies: [{ code: "USD", name: "US Dollar" }],
    units: ["Each"],
    stock_mode: "opening_plan",
  });
  harness.api.listProducts.mockResolvedValue({
    items: [
      {
        id: "product-a",
        name: "Maintenance",
        code: "PRD-001",
        type: "service",
        currency: "USD",
        sale_price: "10.00",
        unit: "Each",
        track_inventory: false,
        category: "Services",
        status: "active",
      },
    ],
    next_cursor: null,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setActiveCompanyId(null);
});
describe("Product workpage", () => {
  it("opens the existing new-product workflow using active company settings without a page company selector", async () => {
    await render();
    expect(add().disabled).toBe(false);
    await act(async () => add().click());
    expect(navigate).toHaveBeenCalledWith("inventory", "add-product", undefined);
    expect(harness.api.getInventoryOptions).toHaveBeenCalledWith("a");
    expect([...container.querySelectorAll("option")].some((option) => option.textContent?.includes("Company A"))).toBe(
      false,
    );
    expect(container.textContent).toContain("PRD-001");
    expect(container.textContent).toContain("USD 10.00");
  });
  it("explains missing currency setup and opens the real setup route without inventing a currency", async () => {
    harness.api.getInventoryOptions.mockResolvedValue({ currencies: [], units: ["Each"], stock_mode: "opening_plan" });
    await render();
    expect(add().disabled).toBe(true);
    expect(container.textContent).toContain("No active two-decimal company currency");
    const setup = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Open currency setup",
    )!;
    await act(async () => setup.click());
    expect(navigate).toHaveBeenCalledWith("finance", "currencies-fx");
  });
  it("retains disabled creation and retry feedback while product settings fail", async () => {
    harness.api.getInventoryOptions.mockRejectedValue(new Error("Unavailable"));
    await render();
    expect(add().disabled).toBe(true);
    expect(container.textContent).toContain("Retry");
  });
  it("continues the real grid directory query when more products are requested", async () => {
    harness.api.listProducts.mockResolvedValueOnce({ items: [], next_cursor: "next-page" });
    await render();
    const more = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Load more products",
    )!;
    await act(async () => more.click());
    expect(harness.api.listProducts).toHaveBeenLastCalledWith(expect.stringContaining("cursor=next-page"));
    expect(container.textContent).toContain("Maintenance");
    expect(container.textContent).not.toContain("Load more products");
  });
});
