// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTable, WorkOffsetPagination } from "../../app/shared/ui/work-table.js";
import { WorkForm } from "../../app/shared/ui/work-form.js";
import { WorkSurfaceContext } from "../../app/shared/ui/work-surface-context.js";
import { rowMatches, tableText, workPageBounds } from "../../app/shared/ui/work-table-model.js";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function Rows({
  count = 53,
  continuation,
  paging,
}: {
  count?: number;
  continuation?: { hasMore: boolean; busy?: boolean; loadMore: () => Promise<void> };
  paging?: boolean;
}) {
  return (
    <WorkTable tableId="test" label="Bills" continuation={continuation} paging={paging}>
      <thead>
        <tr>
          <th>Selection</th>
          <th>Reference</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: count }, (_, index) => (
          <tr key={index}>
            <td>
              <input type="checkbox" aria-label={`Select bill ${index}`} defaultChecked={false} />
            </td>
            <td>Bill {String(index).padStart(3, "0")}</td>
            <td>{index % 2 ? "Paid" : "Unpaid"}</td>
          </tr>
        ))}
      </tbody>
    </WorkTable>
  );
}
const visible = () => Array.from(container.querySelectorAll("tbody tr")).filter((row) => !row.hasAttribute("hidden"));
async function click(label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function choose(size: string) {
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Rows per page"]')!;
  await act(async () => {
    select.value = size;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function input(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("Shared work lists", () => {
  it("keeps account group headings with their matching rows and excludes headings from page counts", async () => {
    await act(async () =>
      root.render(
        <WorkTable tableId="groups" label="Accounts">
          <thead>
            <tr>
              <th>Account</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th colSpan={2}>Assets</th>
            </tr>
            <tr key="cash">
              <td>Cash</td>
              <td>Active</td>
            </tr>
            <tr>
              <th colSpan={2}>Liabilities</th>
            </tr>
            <tr key="payable">
              <td>Payable</td>
              <td>Active</td>
            </tr>
          </tbody>
        </WorkTable>,
      ),
    );
    expect(container.querySelector('nav[aria-label="Table pagination"]')?.textContent).toContain("1–2 / 2");
    await input("Filter accounts", "Cash");
    expect(visible().map((row) => row.textContent)).toEqual(["Assets", "CashActive"]);
    await input("Filter accounts", "missing");
    expect(container.querySelectorAll("tbody tr[key]")).toHaveLength(0);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(visible()[0].textContent).toContain("No rows match");
  });
  it("paginates all four sizes without unmounting selected rows", async () => {
    await act(async () => root.render(<Rows />));
    expect(visible()).toHaveLength(25);
    const checkbox = container.querySelector<HTMLInputElement>('input[aria-label="Select bill 0"]')!;
    await act(async () => checkbox.click());
    await click("Next page");
    expect(visible()[0].textContent).toContain("Bill 025");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(53);
    await click("Previous page");
    expect(checkbox.checked).toBe(true);
    await choose("10");
    expect(visible()).toHaveLength(10);
    await choose("50");
    expect(visible()).toHaveLength(50);
    await choose("100");
    expect(visible()).toHaveLength(53);
    expect(
      Array.from(container.querySelectorAll('select[aria-label="Rows per page"] option')).map((x) => x.textContent),
    ).toEqual(["10", "25", "50", "100"]);
  });
  it("filters display text, resets to the first page, and restores the complete list", async () => {
    await act(async () => root.render(<Rows />));
    await click("Next page");
    await input("Filter bills", "Bill 050");
    expect(visible()).toHaveLength(1);
    expect(visible()[0].textContent).toContain("050");
    await click("Reset table controls");
    expect(visible()).toHaveLength(25);
    expect(visible()[0].textContent).toContain("000");
  });
  it("restores only valid column and size preferences within the current route", async () => {
    localStorage.setItem(
      "nexora:work-table:purchase:bills:test:Selection|Reference|Status",
      JSON.stringify({ size: 10, hidden: [0, 2, 99] }),
    );
    await act(async () =>
      root.render(
        <WorkSurfaceContext.Provider value="purchase:bills">
          <Rows />
        </WorkSurfaceContext.Provider>,
      ),
    );
    expect(visible()).toHaveLength(10);
    const headings = container.querySelectorAll("th");
    expect(headings[0].hidden).toBe(false);
    expect(headings[2].hidden).toBe(true);
    await act(async () =>
      root.render(
        <WorkSurfaceContext.Provider value="bank:payments">
          <Rows />
        </WorkSurfaceContext.Provider>,
      ),
    );
    expect(visible()).toHaveLength(25);
    expect(container.querySelectorAll("th")[2].hidden).toBe(false);
  });
  it("keeps empty/loading placeholders and avoids controls on editable form tables", async () => {
    await act(async () =>
      root.render(
        <WorkForm>
          <Rows />
        </WorkForm>,
      ),
    );
    expect(container.querySelector("[data-work-table]")).toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(53);
    await act(async () =>
      root.render(
        <WorkTable tableId="empty">
          <thead>
            <tr>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={1}>No bills</td>
            </tr>
          </tbody>
        </WorkTable>,
      ),
    );
    expect(container.textContent).toContain("No bills");
  });
  it("fills a requested cursor page, fetches bounded batches, and retries a failed continuation", async () => {
    const failed = vi.fn(async () => {
      throw Error("offline");
    });
    await act(async () => root.render(<Rows count={25} continuation={{ hasMore: true, loadMore: failed }} />));
    expect(failed).not.toHaveBeenCalled();
    await click("Next page");
    expect(failed).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')?.disabled).toBe(false);
    await click("Next page");
    expect(failed).toHaveBeenCalledTimes(2);
    function CursorRows() {
      const [count, setCount] = useState(25);
      return (
        <Rows count={count} continuation={{ hasMore: count < 75, loadMore: async () => setCount((v) => v + 25) }} />
      );
    }
    await act(async () => root.render(<CursorRows />));
    await click("Next page");
    expect(visible()[0].textContent).toContain("025");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(50);
  });
  it("does not repeatedly fetch the remote directory when a local filter has no matches", async () => {
    const load = vi.fn(async () => undefined);
    await act(async () => root.render(<Rows count={25} continuation={{ hasMore: true, loadMore: load }} />));
    await input("Filter bills", "missing");
    await click("Next page");
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("No rows match");
  });
  it("forwards server offset paging and size actions without local slicing", async () => {
    const size = vi.fn(),
      previous = vi.fn(),
      next = vi.fn();
    await act(async () =>
      root.render(
        <WorkOffsetPagination
          total={143}
          offset={25}
          size={25}
          previousDisabled={false}
          nextDisabled={false}
          onSizeChange={size}
          onPrevious={previous}
          onNext={next}
        />,
      ),
    );
    expect(container.textContent).toContain("26–50 / 143");
    await choose("100");
    expect(size).toHaveBeenCalledWith(100);
    await click("Next page");
    await click("Previous page");
    expect(next).toHaveBeenCalledOnce();
    expect(previous).toHaveBeenCalledOnce();
  });
  it("bounds pages and evaluates field conditions without inspecting business object props", () => {
    expect(workPageBounds(3, 9, 25)).toEqual({ index: 0, start: 1, end: 3 });
    expect(workPageBounds(0, 9, 25)).toEqual({ index: 0, start: 0, end: 0 });
    expect(rowMatches(["BILL-001", "Paid"], "bill", [{ column: 1, operator: "equals", value: "paid" }])).toBe(true);
    expect(rowMatches(["BILL-001", "Unpaid"], "", [{ column: 1, operator: "excludes", value: "paid" }])).toBe(false);
    expect(rowMatches(["—"], "", [{ column: 0, operator: "empty", value: "" }])).toBe(true);
    function PrivateRecord(_props: { record: { secret: string } }) {
      void _props;
      return null;
    }
    expect(tableText(<PrivateRecord record={{ secret: "not-searchable" }} />)).toBe("");
  });
});
